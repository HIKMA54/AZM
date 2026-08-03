package com.azm.usagestats

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
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
     */
    @ReactMethod
    fun getLaunchableApps(promise: Promise) {
        try {
            val pm = reactContext.packageManager
            val intent = Intent(Intent.ACTION_MAIN, null)
                .addCategory(Intent.CATEGORY_LAUNCHER)
            val resolveInfos = pm.queryIntentActivities(intent, 0)
            val out = Arguments.createArray()
            val seen = HashSet<String>()
            for (ri in resolveInfos) {
                val pkg = ri.activityInfo.packageName
                if (pkg == reactContext.packageName) continue
                if (!seen.add(pkg)) continue
                val map = Arguments.createMap()
                map.putString("packageName", pkg)
                map.putString("appName", ri.loadLabel(pm).toString())
                out.pushMap(map)
            }
            promise.resolve(out)
        } catch (e: Exception) {
            promise.reject("GET_APPS_FAILED", e)
        }
    }
}