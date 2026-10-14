# Azm

Azm is an Android app that detects doom-scrolling and interrupts it. It reads app-usage events on the phone, rebuilds them into sessions, checks them against four named rules, and steps in with a full-screen interrupt that says exactly which rule fired and offers something else to do. Everything runs on the device; no usage data leaves the phone.

Azm never blocks an app. Taking a break is always one tap; continuing to scroll costs a short, growing wait.

Android only: iOS gives third-party apps no equivalent of `UsageStatsManager`.

*Final-year project, Department of Computer Science, University of Ghana (2026).*

## Features

- **Detection on the device** from Android's own usage records. No accessibility service, and no reading of screen content or messages.
- **Four rules**, each compared with the user's own history where it makes sense:
  - **Impulse opens:** an app opened at least twice as often as usual today (minimum 4 opens).
  - **Long session:** a session at least twice as long as usual (minimum 10 minutes).
  - **Late night:** any use after the late-night hour set in Settings (default 23:00).
  - **Daily goal:** total time on tracked apps past the daily goal (default 120 minutes).
- **Learning phase:** for the first 7 days, the two rules that need a baseline (impulse opens and long session) stay off. Late night and daily goal work from day one.
- **Full-screen interrupt** with:
  - a line from yesterday's record ("Yesterday you took a break after 35 minutes");
  - alternatives to scrolling: a one-minute guided breathing exercise, or "Step away";
  - "Why am I seeing this?", which lists the rule and the numbers behind it.
- **Interrupt over other apps:** with the "Display over other apps" permission, the background check brings Azm in front of the app you're using. Without it, Azm sends a notification.
- **Limits on Azm itself:** quiet hours, a daily cap of 8 interventions, and a cooldown that depends on your last answer (45 minutes after a break, 15 after "keep scrolling", 30 otherwise).
- **Today, Insights and Settings screens**, showing plain-language facts rather than a score.

## How it works

```
UsageStatsManager (Android)
  → UsageStatsModule.kt        Kotlin bridge: raw foreground/background events
  → ingest.ts                  reads forward from a saved checkpoint (max 7 days back)
  → sessionize.ts              pairs events into sessions → SQLite
  → rollups.ts / baselines.ts  per-app daily totals; 14-day baseline
  → rules.ts / engine.ts       the four rules; risk level derived when read, never stored
  → interventionEngine.ts      gates (quiet hours, cooldown, cap) → decision
  → InterruptModal.tsx         full-screen interrupt in the app
```

**When Azm is closed,** a foreground service (`AzmMonitorService.kt`) wakes every 15 minutes and runs the same TypeScript engine as a headless task (`backgroundTask.ts`). If it decides to intervene, it does one of two things:
- **With the permission granted:** it brings Azm to the front, and the interrupt for that intervention appears.
- **Without it:** it posts a notification. Opening Azm within 15 minutes shows the same interrupt.

**Risk level** comes from which rules fired:

| Rules fired | Risk | Interrupt shown |
|---|---|---|
| none | low | none |
| 1–2 | medium | "A gentle nudge": Take a break / Keep scrolling |
| 3 or more, or daily goal together with impulse opens | high | "Time to pause": adds a "Not now" option |

## Getting started

Requirements: Node.js 22.11 or later, JDK 17 or later (developed with JDK 20), the Android SDK, and an Android phone or emulator.

```sh
npm install
npm start          # Metro bundler (development)
npm run android    # build and install a debug build
```

Standalone release build (runs without the laptop):

```sh
cd android
./gradlew assembleRelease          # Windows PowerShell: .\gradlew.bat assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```

Release signing reads `android/keystore.properties`, which is not in git. Without it, use the debug build.

### Permissions on the phone

1. **Usage access** (required): Settings → Apps → Special access → Usage access → Azm.
2. **Notifications:** asked for when you turn on background monitoring.
3. **Display over other apps** (optional): Azm → Settings → *Interrupt over other apps* → Allow.
4. **Battery** (Samsung and similar): set Azm to *Unrestricted* so the background check isn't paused.

## Configuration

Every threshold is in one of two files, so it can be checked and changed in one place:

- `src/detection/detectionConfig.ts`: baseline window (14 days), learning phase (7 days), rule multipliers and minimums, maximum look-back (7 days).
- `src/interventions/interventionConfig.ts`: daily cap, cooldowns, the "keep scrolling" delay (5 s, +10 s per prompt that day, max 60 s), trigger priority, and the 15-minute window for showing an unanswered intervention.

## Project structure

```
android/app/src/main/java/com/azm/
  usagestats/   UsageStatsModule.kt, UsageStatsPackage.kt   native usage bridge
  background/   AzmMonitorService.kt, AzmTaskService.kt,
                AzmNotifications.kt, MonitorModule.kt       background service, notifications, bring-to-front
src/
  background/     headless task and monitoring controls
  components/     InterruptModal, WhyModal, BreathingExercise, AppPickerModal, shared UI
  database/       SQLite setup, schema and repositories
  detection/      ingestion, sessions, rollups, baselines, rules, engine, history
  hooks/          data for the Today and Insights screens
  interventions/  decision engine, response log, in-app watcher
  navigation/     tab bar
  screens/        Today, Insights, Settings
  theme/          colours, spacing, type
  utils/          app names, dates
__tests__/        unit tests (Jest)
scripts/          on-device checks for ingestion and app scoping (adb)
```

## Data

Six SQLite tables, stored only on the phone: `tracked_apps`, `sessions`, `daily_rollups`, `app_baselines`, `interventions`, `settings`. See `src/database/schema.ts`. There is no risk-score column: risk is always worked out from the rules when it is needed.

## Tests

```sh
npm test
```

The unit tests cover the date helpers, app-name lookup, the intervention log queries (including days when clocks change), and re-showing an unanswered intervention. Run them in another timezone with `TZ=America/New_York npm test` (macOS/Linux).

## Limitations

- **What it detects:** Azm sees which app is open and for how long, not what is on screen. It detects long social media sessions rather than doom-scrolling specifically.
- **Timing:** background checks run every 15 minutes, so an interrupt can arrive up to 15 minutes after a rule fires.
- **Testing so far:** Azm has been tested on an emulator and one Samsung phone. Behaviour on other manufacturers' battery management is untested.
- **Effect on behaviour:** whether Azm changes behaviour has not been measured; a before-and-after study is designed but not yet run.

## License

MIT. See `LICENSE`.
