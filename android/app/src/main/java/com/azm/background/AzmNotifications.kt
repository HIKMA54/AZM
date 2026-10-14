package com.azm.background

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationCompat

/**
 * monitor: the silent ongoing notification the foreground service needs.
 * intervention: the high-priority nudge posted when the app is closed.
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
            .notify(interventionId++, notif)
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
     * Brings Azm to the front so JS can show the pending intervention. Needs the
     * overlay permission when launched from the background. Returns false if it
     * couldn't, so the caller can post a notification instead.
     */
    fun openInterrupt(context: Context): Boolean {
        if (!canDrawOverlays(context)) return false
        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?: return false
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
        return try {
            context.startActivity(intent)
            true
        } catch (e: Exception) {
            false
        }
    }
}
