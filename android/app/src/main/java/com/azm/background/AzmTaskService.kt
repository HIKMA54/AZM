package com.azm.background

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/** Runs the 'AzmBackground' headless JS task registered in index.js. */
class AzmTaskService : HeadlessJsTaskService() {
    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig {
        return HeadlessJsTaskConfig(
            "AzmBackground",
            Arguments.createMap().apply {
                // Set by MonitorModule.runCheckIn (the Settings test button).
                putBoolean("test", intent?.getBooleanExtra("test", false) ?: false)
            },
            30000,
            true, // allow in foreground
        )
    }
}