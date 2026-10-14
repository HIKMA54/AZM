package com.azm.background

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

    // Opens the full-screen interrupt if allowed, otherwise posts a notification.
    @ReactMethod
    fun postIntervention(title: String, body: String) {
        if (!AzmNotifications.openInterrupt(ctx)) {
            AzmNotifications.postIntervention(ctx, title, body)
        }
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