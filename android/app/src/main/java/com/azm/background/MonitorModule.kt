package com.azm.background

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** JS bridge for starting/stopping monitoring and posting nudge notifications. */
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

    /** Posts an intervention notification (called from the headless task). */
    @ReactMethod
    fun postIntervention(title: String, body: String) {
        AzmNotifications.postIntervention(ctx, title, body)
    }
}