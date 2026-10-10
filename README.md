# Azm

A behaviour-aware Android app that detects and interrupts doom-scrolling. Azm reads app-usage events on the device, rebuilds them into sessions, checks them against a small set of named rules, and steps in with graduated interventions. Every intervention can show the exact rule and numbers that triggered it. Nothing leaves the phone.

Android only: iOS has no equivalent of `UsageStatsManager`.

## How it works

1. **Usage events.** A custom Kotlin native module (`android/.../usagestats/UsageStatsModule.kt`) reads foreground and background events from `UsageStatsManager` and passes them to JavaScript.
2. **Ingestion.** `src/detection/ingest.ts` reads forward from a saved checkpoint, so no day is lost if the app was not running.
3. **Sessions and rollups.** Events are paired into sessions and summarised per app per day in SQLite (`op-sqlite`).
4. **Detection.** `src/detection/rules.ts` checks four rules: impulse opens, long sessions, late-night use and the daily goal. Each rule is compared against the user's own baseline. Thresholds live in `src/detection/detectionConfig.ts`.
5. **Interventions.** `src/interventions/` decides whether to step in, subject to cooldowns, quiet hours and a daily cap. Continuing to scroll carries a delay that grows with each repeat that day; taking a break is always instant.
6. **Background.** A foreground service and a headless JS task keep detection running when the app is closed.

## Screens

- **Today:** a plain-language read of the day, key numbers and what stood out.
- **Insights:** the last seven days.
- **Settings:** tracked apps, daily goal and late-night hour.
- **Interrupt:** the prompt, with a one-minute breathing option, "Step away", a line from yesterday's record and a "Why am I seeing this?" view.

## Running it

```sh
npm install
npm start          # Metro
npm run android    # build and install on an emulator or device
```

On first launch, grant **Usage access** when prompted (Settings → Apps → Special access → Usage access).

## Data model

Six SQLite tables: `tracked_apps`, `sessions`, `daily_rollups`, `app_baselines`, `interventions` and `settings`. See `src/database/schema.ts`.
