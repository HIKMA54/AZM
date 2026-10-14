package com.azm.background

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import androidx.core.app.NotificationCompat

/**
 * monitor: the silent ongoing notification the foreground service needs.
 * intervention: the high-priority nudge posted when the app is closed.
 */
object AzmNotifications {
    const val MONITOR_CHANNEL = "azm_monitor"
    const val INTERVENTION_CHANNEL = "azm_intervention"
    const val MONITOR_NOTIF_ID = 1001
    const val INTERVENTION_NOTIF_ID = 2000
    const val LOG_TAG = "Azm"
    private val mainHandler = Handler(Looper.getMainLooper())

    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val mgr = context.getSystemService(NotificationManager::class.java)

        val monitor = NotificationChannel(
            MONITOR_CHANNEL,
            "Azm monitoring",
            NotificationManager.IMPORTANCE_MIN,
        ).apply { description = "Shows quietly while Azm watches your patterns." }

        val intervention = NotificationChannel(
            INTERVENTION_CHANNEL,
            "Azm nudges",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply { description = "Gentle reminders to take a break." }

        mgr.createNotificationChannel(monitor)
        mgr.createNotificationChannel(intervention)
    }

    private fun launchIntent(context: Context, requestCode: Int): PendingIntent {
        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        return PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
    }

    fun buildMonitorNotification(context: Context): Notification {
        return NotificationCompat.Builder(context, MONITOR_CHANNEL)
            .setContentTitle("Azm is noticing your patterns")
            .setContentText("Quietly in the background. Tap to open.")
            .setSmallIcon(context.applicationInfo.icon)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setContentIntent(launchIntent(context, 0))
            .build()
    }

    fun postIntervention(context: Context, title: String, body: String) {
        ensureChannels(context)
        val notif = NotificationCompat.Builder(context, INTERVENTION_CHANNEL)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setSmallIcon(context.applicationInfo.icon)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(launchIntent(context, 1))
            .build()
        context.getSystemService(NotificationManager::class.java)
            .notify(INTERVENTION_NOTIF_ID, notif)
        Log.i(LOG_TAG, "intervention notification posted")
    }

    /** Removes the intervention notification once the interrupt is on screen. */
    fun cancelIntervention(context: Context) {
        context.getSystemService(NotificationManager::class.java)
            .cancel(INTERVENTION_NOTIF_ID)
    }

    fun canDrawOverlays(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)

    fun openOverlaySettings(context: Context) {
        val intent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:" + context.packageName),
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }

    /**
     * Brings Azm to the front so JS can show the pending intervention.
     *
     * Since Android 15, holding "Display over other apps" only lets an app start
     * an activity from the background while one of its overlay windows is
     * visible. So a 1x1 transparent, untouchable overlay is shown first, the
     * activity is started, and the overlay is removed a moment later.
     * Returns false when the permission is missing.
     */
    fun openInterrupt(context: Context): Boolean {
        val allowed = canDrawOverlays(context)
        Log.i(LOG_TAG, "openInterrupt: canDrawOverlays=$allowed")
        if (!allowed) return false
        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?: return false
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
        val app = context.applicationContext
        mainHandler.post {
            val anchor = showAnchorOverlay(app)
            try {
                app.startActivity(intent)
                Log.i(LOG_TAG, "openInterrupt: startActivity sent (anchor=${anchor != null})")
            } catch (e: Exception) {
                Log.w(LOG_TAG, "openInterrupt: startActivity failed", e)
            }
            if (anchor != null) {
                mainHandler.postDelayed({ removeAnchorOverlay(app, anchor) }, 2000)
            }
        }
        return true
    }

    private fun showAnchorOverlay(context: Context): View? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return null
        return try {
            val wm = context.getSystemService(WindowManager::class.java)
            val view = View(context)
            val params = WindowManager.LayoutParams(
                1,
                1,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
                PixelFormat.TRANSLUCENT,
            ).apply { gravity = Gravity.TOP or Gravity.START }
            wm.addView(view, params)
            view
        } catch (e: Exception) {
            Log.w(LOG_TAG, "openInterrupt: overlay anchor failed", e)
            null
        }
    }

    private fun removeAnchorOverlay(context: Context, view: View) {
        try {
            context.getSystemService(WindowManager::class.java).removeView(view)
        } catch (e: Exception) {
            // Already gone.
        }
    }
}
