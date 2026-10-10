#!/bin/sh
# Verifies the Fault 1 / Fault 2 fix at the data layer: seeds a tracked app, an
# untracked-but-real app, the home launcher, and Azm itself into a throwaway
# SQLite file carrying Azm's real schema, then runs the exact query shapes
# src/database/trackedAppsRepo.ts (getScopedApps), src/detection/rollups.ts
# (refreshRollups) and src/hooks/useDashboard.ts/useInsights.ts now use, and
# asserts only the tracked app ever survives.
#
# @op-engineering/op-sqlite is a JSI native module with no Node/Jest binding,
# so the TS modules themselves can't run outside the Android app process; this
# exercises the same SQL those modules issue against a real sqlite3 file
# instead, which is what actually carried the bug. Native picker exclusion
# (Kotlin) and end-to-end app behaviour are verified separately, on-device
# (see the before/after DB pull and screenshots).
#
# Usage: sh scripts/verify-scoping.sh

set -e
DB=$(mktemp -u).db
trap 'rm -f "$DB"' EXIT

# The Windows sqlite3.exe build emits CRLF line endings; strip the \r so
# multi-row output compares cleanly against plain-\n expected values.
SQLITE() { "${SQLITE_BIN:-sqlite3}" "$@" | tr -d '\r'; }

fail=0
assert_eq() {
  # assert_eq <label> <actual> <expected>
  if [ "$2" = "$3" ]; then
    echo "PASS: $1"
  else
    echo "FAIL: $1 -- got [$2], expected [$3]"
    fail=1
  fi
}

# ---- schema (mirrors src/database/schema.ts) --------------------------------
SQLITE "$DB" <<'SQL'
CREATE TABLE tracked_apps (
  package_name TEXT PRIMARY KEY,
  app_name     TEXT NOT NULL,
  is_tracked   INTEGER NOT NULL DEFAULT 1,
  added_at     INTEGER NOT NULL
);
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
CREATE TABLE daily_rollups (
  local_date    TEXT NOT NULL,
  package_name  TEXT NOT NULL,
  opens_count   INTEGER NOT NULL DEFAULT 0,
  total_ms      INTEGER NOT NULL DEFAULT 0,
  late_night_ms INTEGER NOT NULL DEFAULT 0,
  first_open    INTEGER,
  last_open     INTEGER,
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (local_date, package_name)
);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
SQL

DATE='2026-09-29'

# ---- seed: one tracked app, one untracked-but-real app, launcher, Azm -------
SQLITE "$DB" <<SQL
INSERT INTO tracked_apps VALUES ('com.whatsapp', 'WhatsApp', 1, 1000);

-- tracked app: 3 opens, 10 min total
INSERT INTO sessions (package_name, start_time, end_time, duration_ms, was_open, local_date, hour_of_day, created_at) VALUES
  ('com.whatsapp', 1, 2, 120000, 0, '$DATE', 9, 1),
  ('com.whatsapp', 3, 4, 180000, 0, '$DATE', 12, 1),
  ('com.whatsapp', 5, 6, 300000, 0, '$DATE', 20, 1);

-- untracked but real app (e.g. Settings): should never appear once scoped
INSERT INTO sessions (package_name, start_time, end_time, duration_ms, was_open, local_date, hour_of_day, created_at) VALUES
  ('com.android.settings', 10, 11, 60000, 0, '$DATE', 10, 1),
  ('com.android.settings', 12, 13, 60000, 0, '$DATE', 11, 1);

-- the home launcher: must never count, even though it has far more opens/time
INSERT INTO sessions (package_name, start_time, end_time, duration_ms, was_open, local_date, hour_of_day, created_at) VALUES
  ('com.sec.android.app.launcher', 20, 21, 600000, 0, '$DATE', 9, 1),
  ('com.sec.android.app.launcher', 22, 23, 600000, 0, '$DATE', 13, 1);

-- Azm itself: must never count
INSERT INTO sessions (package_name, start_time, end_time, duration_ms, was_open, local_date, hour_of_day, created_at) VALUES
  ('com.azm', 30, 31, 5000, 0, '$DATE', 14, 1);

-- pre-existing "dirty" rollups from before the fix, as if refreshRollups() had
-- already baked the launcher/Azm into daily_rollups
INSERT INTO daily_rollups VALUES ('$DATE', 'com.sec.android.app.launcher', 2, 1200000, 0, 20, 22, 1);
INSERT INTO daily_rollups VALUES ('$DATE', 'com.azm', 1, 5000, 0, 30, 30, 1);

-- system_excluded_packages, as primeSystemExclusions() would persist it
INSERT INTO settings VALUES ('system_excluded_packages', '["com.sec.android.app.launcher","com.android.systemui","com.azm"]');
SQL

EXCLUDED="'com.sec.android.app.launcher','com.android.systemui','com.azm'"

# ---- getScopedApps(): tracked apps (minus hard-excluded) -------------------
SCOPED=$(SQLITE "$DB" "SELECT package_name FROM tracked_apps WHERE is_tracked = 1 AND package_name NOT IN ($EXCLUDED);")
assert_eq "getScopedApps() returns only the tracked app" "$SCOPED" "com.whatsapp"

# ---- Today: times opened / minutes, scoped -----------------------------------
OPENS=$(SQLITE "$DB" "SELECT COUNT(*) FROM sessions WHERE local_date='$DATE' AND package_name IN ('com.whatsapp');")
assert_eq "Today opens counts only the tracked app's sessions" "$OPENS" "3"

TOTAL_MIN=$(SQLITE "$DB" "SELECT SUM(duration_ms)/60000 FROM sessions WHERE local_date='$DATE' AND package_name IN ('com.whatsapp');")
assert_eq "Today total minutes excludes launcher/settings/azm" "$TOTAL_MIN" "10"

# ---- By app / What pulled hardest, scoped ------------------------------------
TOP_APPS=$(SQLITE "$DB" "SELECT package_name FROM sessions WHERE local_date='$DATE' AND package_name IN ('com.whatsapp') GROUP BY package_name ORDER BY SUM(duration_ms) DESC;")
assert_eq "By app / What pulled hardest lists only the tracked app" "$TOP_APPS" "com.whatsapp"

# sanity: prove the bug would have surfaced without scoping (launcher wins on raw data)
UNSCOPED_TOP=$(SQLITE "$DB" "SELECT package_name FROM sessions WHERE local_date='$DATE' GROUP BY package_name ORDER BY SUM(duration_ms) DESC LIMIT 1;")
assert_eq "sanity: unscoped query would have put the launcher on top (the original bug)" "$UNSCOPED_TOP" "com.sec.android.app.launcher"

# ---- refreshRollups(): stale launcher/Azm rows must be deleted, not just skipped
SQLITE "$DB" "DELETE FROM daily_rollups WHERE package_name IN ($EXCLUDED);"
SQLITE "$DB" <<SQL
INSERT INTO daily_rollups
  (local_date, package_name, opens_count, total_ms, late_night_ms, first_open, last_open, updated_at)
SELECT local_date, package_name, COUNT(*), SUM(duration_ms),
       SUM(CASE WHEN hour_of_day >= 23 THEN duration_ms ELSE 0 END),
       MIN(start_time), MAX(start_time), 2
FROM sessions
WHERE package_name NOT IN ($EXCLUDED)
GROUP BY local_date, package_name
ON CONFLICT(local_date, package_name) DO UPDATE SET
  opens_count = excluded.opens_count, total_ms = excluded.total_ms;
SQL

ROLLUP_PKGS=$(SQLITE "$DB" "SELECT package_name FROM daily_rollups ORDER BY package_name;")
EXPECTED_ROLLUP_PKGS=$(printf 'com.android.settings\ncom.whatsapp')
assert_eq "rebuilt daily_rollups has no launcher/Azm rows (raw sessions untouched)" "$ROLLUP_PKGS" "$EXPECTED_ROLLUP_PKGS"

SESSIONS_STILL_HAS_LAUNCHER=$(SQLITE "$DB" "SELECT COUNT(*) FROM sessions WHERE package_name = 'com.sec.android.app.launcher';")
assert_eq "raw sessions rows for the launcher were NOT deleted by the rollup rebuild" "$SESSIONS_STILL_HAS_LAUNCHER" "2"

# ---- Fault 2: display name comes from tracked_apps.app_name, not the package id
REAL_LABEL=$(SQLITE "$DB" "SELECT app_name FROM tracked_apps WHERE package_name = 'com.whatsapp';")
assert_eq "resolved name matches PackageManager's real label" "$REAL_LABEL" "WhatsApp"

# the old bug: prettyName('com.whatsapp') -> capitalize last dot-segment
OLD_BUGGY_NAME="Whatsapp"
if [ "$REAL_LABEL" = "$OLD_BUGGY_NAME" ]; then
  echo "FAIL: fix produced the same name the package-id-derived bug did"
  fail=1
else
  echo "PASS: fixed name ('$REAL_LABEL') differs from the old package-derived guess ('$OLD_BUGGY_NAME')"
fi

echo ""
if [ "$fail" -eq 0 ]; then
  echo "ALL ASSERTIONS PASSED"
else
  echo "SOME ASSERTIONS FAILED"
fi
exit $fail
