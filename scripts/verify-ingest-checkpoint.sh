#!/bin/sh
# Checks the ingest checkpoint SQL from src/detection/ingest.ts against sqlite3:
# a 50h gap is filled once on the right days, a rerun adds nothing, and an
# older commit can't move the checkpoint back. Sessions are synthetic because
# queryEvents() is native.
#
# Usage: sh scripts/verify-ingest-checkpoint.sh

set -e
DB=$(mktemp -u).db
trap 'rm -f "$DB"' EXIT

SQLITE() { "${SQLITE_BIN:-sqlite3}" "$@" | tr -d '\r'; }

fail=0
assert_eq() {
  if [ "$2" = "$3" ]; then
    echo "PASS: $1"
  else
    echo "FAIL: $1 -- got [$2], expected [$3]"
    fail=1
  fi
}

SQLITE "$DB" <<'SQL'
CREATE TABLE sessions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  package_name TEXT NOT NULL,
  start_time   INTEGER NOT NULL,
  end_time     INTEGER NOT NULL,
  duration_ms  INTEGER NOT NULL,
  was_open     INTEGER NOT NULL DEFAULT 0,
  local_date   TEXT NOT NULL,
  hour_of_day  INTEGER NOT NULL,
  created_at   INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_sessions_unique ON sessions(package_name, start_time);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
SQL

# ---- timeline (UTC) -----------------------------------------------------
# checkpoint (last_ingested_at): 2026-09-30 22:00:00  (start of the gap)
# now (this run):                2026-10-03 00:00:00  (50h later)
# The 7-day lookback cap doesn't apply, so begin == checkpoint.
CHECKPOINT=$(( $(TZ=UTC date -d "2026-09-30 22:00:00" +%s) * 1000 ))
NOW=$(( $(TZ=UTC date -d "2026-10-03 00:00:00" +%s) * 1000 ))
SEVEN_DAYS_MS=604800000

BEGIN=$CHECKPOINT
LOOKBACK_FLOOR=$(( NOW - SEVEN_DAYS_MS ))
if [ "$LOOKBACK_FLOOR" -gt "$BEGIN" ]; then BEGIN=$LOOKBACK_FLOOR; fi
assert_eq "begin = checkpoint, not the 7-day floor (gap is well under the cap)" "$BEGIN" "$CHECKPOINT"

# ---- one session on each of two days inside the gap -------------------
SESSION_A_START=$(( $(TZ=UTC date -d "2026-10-01 10:00:00" +%s) * 1000 ))
SESSION_A_END=$(( SESSION_A_START + 5*60000 ))
SESSION_B_START=$(( $(TZ=UTC date -d "2026-10-02 15:00:00" +%s) * 1000 ))
SESSION_B_END=$(( SESSION_B_START + 3*60000 ))

insert_gap_sessions() {
  SQLITE "$DB" "
    INSERT OR IGNORE INTO sessions (package_name, start_time, end_time, duration_ms, was_open, local_date, hour_of_day, created_at) VALUES
      ('com.whatsapp', $SESSION_A_START, $SESSION_A_END, 300000, 0, '2026-10-01', 10, $NOW),
      ('com.whatsapp', $SESSION_B_START, $SESSION_B_END, 180000, 0, '2026-10-02', 15, $NOW);
  "
}

advance_checkpoint() {
  # Same SQL as advanceCheckpoint() in ingest.ts.
  end="$1"
  SQLITE "$DB" "
    INSERT INTO settings (key, value) VALUES ('last_ingested_at', '$end')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
    WHERE CAST(excluded.value AS INTEGER) > CAST(settings.value AS INTEGER);
  "
}

# checkpoint left by an ingest 50h ago
SQLITE "$DB" "INSERT INTO settings VALUES ('last_ingested_at', '$CHECKPOINT');"

# ---- run #1: gap filled once, on the right days ------------------------
insert_gap_sessions
advance_checkpoint "$NOW"

COUNT_A=$(SQLITE "$DB" "SELECT COUNT(*) FROM sessions WHERE local_date='2026-10-01';")
COUNT_B=$(SQLITE "$DB" "SELECT COUNT(*) FROM sessions WHERE local_date='2026-10-02';")
assert_eq "gap session on day 1 (2026-10-01) landed exactly once" "$COUNT_A" "1"
assert_eq "gap session on day 2 (2026-10-02) landed exactly once" "$COUNT_B" "1"

CHECKPOINT_AFTER_RUN1=$(SQLITE "$DB" "SELECT value FROM settings WHERE key='last_ingested_at';")
assert_eq "checkpoint advanced to 'now' after run #1" "$CHECKPOINT_AFTER_RUN1" "$NOW"

# ---- run #2: same inputs, no change ------------------------------------
insert_gap_sessions
advance_checkpoint "$NOW"

TOTAL_AFTER_RUN2=$(SQLITE "$DB" "SELECT COUNT(*) FROM sessions WHERE package_name='com.whatsapp';")
assert_eq "re-running with the same gap data does not create duplicates" "$TOTAL_AFTER_RUN2" "2"

CHECKPOINT_AFTER_RUN2=$(SQLITE "$DB" "SELECT value FROM settings WHERE key='last_ingested_at';")
assert_eq "checkpoint unchanged after re-running with the same 'now'" "$CHECKPOINT_AFTER_RUN2" "$NOW"

# ---- out-of-order commit must not move the checkpoint back
OLDER_NOW=$(( $(TZ=UTC date -d "2026-10-02 12:00:00" +%s) * 1000 ))
advance_checkpoint "$OLDER_NOW"
CHECKPOINT_AFTER_LATE_COMMIT=$(SQLITE "$DB" "SELECT value FROM settings WHERE key='last_ingested_at';")
assert_eq "an out-of-order commit with an older 'now' cannot move the checkpoint backwards" "$CHECKPOINT_AFTER_LATE_COMMIT" "$NOW"

echo ""
if [ "$fail" -eq 0 ]; then
  echo "ALL ASSERTIONS PASSED"
else
  echo "SOME ASSERTIONS FAILED"
fi
exit $fail
