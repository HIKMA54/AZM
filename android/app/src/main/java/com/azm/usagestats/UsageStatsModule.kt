package com.azm.usagestats

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Process
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray

/**
 * Azm's bridge to Android's UsageStatsManager.
 *
 * The module deliberately stays thin: it only fetches raw foreground/background
 * events and reports whether the special access permission is granted. All
 * behavioural logic (sessionizing, impulse-open counting, baselines, late-night
 * detection) lives in JavaScript so that every metric Azm shows can be traced
 * back to raw OS events rather than an opaque native computation. That
 * separation is the defensible story: the OS supplies facts, Azm supplies rules.
 */
class UsageStatsModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "UsageStats"

    companion object {
        private const val SYSTEMUI_PACKAGE = "com.android.systemui"
    }

    /**
     * Resolves the device's current default home app via PackageManager, the
     * same mechanism Android itself uses to decide what the home button opens.
     * Done at runtime (never hardcoded) so it works across manufacturers/launchers.
     * Requires the CATEGORY_HOME <queries> entry on API 30+; returns null rather
     * than throwing if it can't be resolved.
     */
    private fun resolveHomePackage(): String? {
        return try {
            val pm = reactContext.packageManager
            val homeIntent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
            val resolved = pm.resolveActivity(homeIntent, PackageManager.MATCH_DEFAULT_ONLY)
            resolved?.activityInfo?.packageName
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Packages that must never be tracked or counted as usage, regardless of
     * what the user has picked: the device's home launcher (every return to
     * home reads as an "open" otherwise), System UI, and Azm itself.
     */
    @ReactMethod
    fun getSystemExcludedPackages(promise: Promise) {
        try {
            val out = Arguments.createArray()
            resolveHomePackage()?.let { out.pushString(it) }
            out.pushString(SYSTEMUI_PACKAGE)
            out.pushString(reactContext.packageName)
            promise.resolve(out)
        } catch (e: Exception) {
            promise.reject("GET_EXCLUDED_FAILED", e)
        }
    }

    /**
     * On-demand display-name resolution for a single package, used only as a
     * fallback when no cached name exists (see trackedAppsRepo's name map).
     * Resolves the true app-level label, not an activity label, so it matches
     * what the Tracked Apps picker shows. Null if the package is uninstalled
     * or otherwise can't be resolved.
     */
    @ReactMethod
    fun getAppLabel(packageName: String, promise: Promise) {
        try {
            val pm = reactContext.packageManager
            val appInfo = pm.getApplicationInfo(packageName, 0)
            promise.resolve(pm.getApplicationLabel(appInfo).toString())
        } catch (e: PackageManager.NameNotFoundException) {
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("GET_APP_LABEL_FAILED", e)
        }
    }

    /**
     * PACKAGE_USAGE_STATS is a "special" permission: it cannot be requested with
     * a runtime dialog. We check it via AppOpsManager and, if missing, deep-link
     * the user to the Usage Access settings screen (see openUsageAccessSettings).
     */
    @ReactMethod
    fun hasUsageAccess(promise: Promise) {
        try {
            val appOps = reactContext
                .getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
            val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                appOps.unsafeCheckOpNoThrow(
                    AppOpsManager.OPSTR_GET_USAGE_STATS,
                    Process.myUid(),
                    reactContext.packageName
                )
            } else {
                @Suppress("DEPRECATION")
                appOps.checkOpNoThrow(
                    AppOpsManager.OPSTR_GET_USAGE_STATS,
                    Process.myUid(),
                    reactContext.packageName
                )
            }
            promise.resolve(mode == AppOpsManager.MODE_ALLOWED)
        } catch (e: Exception) {
            promise.reject("USAGE_ACCESS_CHECK_FAILED", e)
        }
    }

    @ReactMethod
    fun openUsageAccessSettings() {
        val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        reactContext.startActivity(intent)
    }

    /**
     * Returns the raw foreground (1) and background (2) events between two
     * epoch-millisecond timestamps. Only these two event types are passed
     * through; everything else in the UsageEvents stream is noise for our
     * purposes. Timestamps stay well within JS safe-integer range.
     */
    @ReactMethod
    fun queryEvents(beginTime: Double, endTime: Double, promise: Promise) {
        try {
            val usm = reactContext
                .getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
            val events = usm.queryEvents(beginTime.toLong(), endTime.toLong())
            val out: WritableArray = Arguments.createArray()
            val event = UsageEvents.Event()
            while (events.hasNextEvent()) {
                events.getNextEvent(event)
                val type = event.eventType
                // MOVE_TO_FOREGROUND == 1, MOVE_TO_BACKGROUND == 2 across API levels.
                if (type == UsageEvents.Event.MOVE_TO_FOREGROUND ||
                    type == UsageEvents.Event.MOVE_TO_BACKGROUND
                ) {
                    val map = Arguments.createMap()
                    map.putString("packageName", event.packageName)
                    map.putInt("eventType", type)
                    map.putDouble("timestamp", event.timeStamp.toDouble())
                    out.pushMap(map)
                }
            }
            promise.resolve(out)
        } catch (e: Exception) {
            promise.reject("QUERY_EVENTS_FAILED", e)
        }
    }

    /**
     * Lists launchable (user-facing) apps for the "Tracked apps" picker.
     * Querying LAUNCHER activities avoids the QUERY_ALL_PACKAGES permission,
     * which keeps Azm's privacy posture clean: it only ever sees apps that
     * appear in the launcher, never a full package inventory.
     *
     * The device's home app, System UI, and Azm itself are excluded here too
     * (not just in JS): returning to the home screen isn't "using an app", so
     * it must never even be offered as something to track.
     */
    @ReactMethod
    fun getLaunchableApps(promise: Promise) {
        try {
            val pm = reactContext.packageManager
            val excluded = HashSet<String>()
            resolveHomePackage()?.let { excluded.add(it) }
            excluded.add(SYSTEMUI_PACKAGE)
            excluded.add(reactContext.packageName)

            val intent = Intent(Intent.ACTION_MAIN, null)
                .addCategory(Intent.CATEGORY_LAUNCHER)
            val resolveInfos = pm.queryIntentActivities(intent, 0)
            val out = Arguments.createArray()
            val seen = HashSet<String>()
            for (ri in resolveInfos) {
                val pkg = ri.activityInfo.packageName
                if (pkg in excluded) continue
                if (!seen.add(pkg)) continue
                val map = Arguments.createMap()
                map.putString("packageName", pkg)
                // App-level label (matches getAppLabel/getApplicationLabel), not the
                // activity's own label, so the picker and every other screen agree.
                val label = try {
                    pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
                } catch (e: PackageManager.NameNotFoundException) {
                    ri.loadLabel(pm).toString()
                }
                map.putString("appName", label)
                out.pushMap(map)
            }
            promise.resolve(out)
        } catch (e: Exception) {
            promise.reject("GET_APPS_FAILED", e)
        }
    }
}