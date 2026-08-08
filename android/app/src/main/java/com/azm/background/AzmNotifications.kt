package com.azm.background

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat

/**
 * Notification channels and builders for Azm's background monitoring.
 *
 * Two channels, deliberately different in weight:
 *   - monitor: IMPORTANCE_MIN, the silent "Azm is watching" ongoing notice the
 *     foreground service requires. It must feel invisible — Azm isn't here to
 *     add to the pile.
 *   - intervention: IMPORTANCE_HIGH, the actual nudge when the app is closed.
 */
object AzmNotifications {
    const val MONITOR_CHANNEL = "azm_monitor"
    const val INTERVENTION_CHANNEL = "azm_intervention"
    const val MONITOR_NOTIF_ID = 1001
    private var interventionId = 2000

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

    /** The ongoing, silent notification that keeps the foreground service alive. */
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

    /** A nudge shown when the app is closed and a rule fired. */
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
            .notify(interventionId++, notif)
    }
}