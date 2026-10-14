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
 * Bridge to UsageStatsManager and PackageManager. Only returns raw events and
 * app info; sessionizing and detection happen in JS.
 */
class UsageStatsModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "UsageStats"

    companion object {
        private const val SYSTEMUI_PACKAGE = "com.android.systemui"
    }

    // Default launcher package. Needs the CATEGORY_HOME <queries> entry on API 30+.
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

    // Launcher, System UI and Azm. Without this every return to home counts as an open.
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

    // Application label (not activity label) so it matches the picker. Null if uninstalled.
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

    // PACKAGE_USAGE_STATS can't be requested at runtime, so check it via AppOps.
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

    // Foreground/background events only, between two epoch-ms timestamps.
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

    // Launchable apps for the picker, minus the excluded packages. Querying
    // LAUNCHER activities avoids needing QUERY_ALL_PACKAGES.
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