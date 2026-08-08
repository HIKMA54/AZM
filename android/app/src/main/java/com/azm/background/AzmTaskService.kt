package com.azm.background

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Runs the registered 'AzmBackground' JS task with no UI. This is what lets the
 * background service reuse the exact detection + intervention engine written in
 * TypeScript, instead of reimplementing any of it in Kotlin.
 */
class AzmTaskService : HeadlessJsTaskService() {
    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig {
        return HeadlessJsTaskConfig(
            "AzmBackground", // must match AppRegistry.registerHeadlessTask in index.js
            Arguments.createMap(),
            30000, // timeout (ms) — the check is short
            true, // allowed to run even when the app is in the foreground
        )
    }
}