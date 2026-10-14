package com.azm.background

import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class MonitorModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName(): String = "AzmMonitor"

    @ReactMethod
    fun start(promise: Promise) {
        try {
            AzmMonitorService.start(ctx)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("START_FAILED", e)
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        try {
            AzmMonitorService.stop(ctx)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_FAILED", e)
        }
    }

    @ReactMethod
    fun isRunning(promise: Promise) {
        promise.resolve(AzmMonitorService.running)
    }

    /**
     * Tries to bring the interrupt in front of the current app, and always posts
     * the notification as well: if Android blocks the launch silently, the
     * notification is still there. JS removes it once the interrupt is shown.
     */
    @ReactMethod
    fun postIntervention(title: String, body: String) {
        Log.i(AzmNotifications.LOG_TAG, "postIntervention: $title")
        AzmNotifications.openInterrupt(ctx)
        AzmNotifications.postIntervention(ctx, title, body)
    }

    @ReactMethod
    fun clearInterventionNotification() {
        AzmNotifications.cancelIntervention(ctx)
    }

    /** Lets the headless task write to logcat (adb logcat -s Azm). */
    @ReactMethod
    fun log(message: String) {
        Log.i(AzmNotifications.LOG_TAG, message)
    }

    /** Testing aid: runs one background check after the given number of seconds. */
    @ReactMethod
    fun runCheckIn(seconds: Double, promise: Promise) {
        val delayMs = (seconds * 1000).toLong()
        Log.i(AzmNotifications.LOG_TAG, "test check scheduled in ${seconds.toInt()}s")
        Handler(Looper.getMainLooper()).postDelayed({
            try {
                ctx.startService(
                    Intent(ctx, AzmTaskService::class.java).putExtra("test", true),
                )
                Log.i(AzmNotifications.LOG_TAG, "test check started")
            } catch (e: Exception) {
                Log.w(AzmNotifications.LOG_TAG, "test check failed to start", e)
            }
        }, delayMs)
        promise.resolve(true)
    }

    @ReactMethod
    fun canDrawOverlays(promise: Promise) {
        promise.resolve(AzmNotifications.canDrawOverlays(ctx))
    }

    @ReactMethod
    fun openOverlaySettings(promise: Promise) {
        try {
            AzmNotifications.openOverlaySettings(ctx)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("OVERLAY_SETTINGS_FAILED", e)
        }
    }
}