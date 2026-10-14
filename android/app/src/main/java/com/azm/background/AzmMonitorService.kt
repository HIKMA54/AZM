package com.azm.background

import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper

/**
 * Foreground service that starts AzmTaskService every 15 minutes. Detection
 * itself runs in JS; this only keeps the process alive through Doze.
 */
class AzmMonitorService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private val intervalMs = 15 * 60 * 1000L

    private val tick = object : Runnable {
        override fun run() {
            runCheck()
            handler.postDelayed(this, intervalMs)
        }
    }

    override fun onCreate() {
        super.onCreate()
        running = true
        AzmNotifications.ensureChannels(this)
        startForeground(
            AzmNotifications.MONITOR_NOTIF_ID,
            AzmNotifications.buildMonitorNotification(this),
        )
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        handler.removeCallbacks(tick)
        handler.post(tick)
        return START_STICKY
    }

    private fun runCheck() {
        try {
            startService(Intent(this, AzmTaskService::class.java))
        } catch (e: Exception) {
            // Skip this tick; the next one will try again.
        }
    }

    override fun onDestroy() {
        handler.removeCallbacks(tick)
        running = false
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        @JvmStatic
        var running = false
            private set

        fun start(context: Context) {
            val intent = Intent(context, AzmMonitorService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, AzmMonitorService::class.java))
        }
    }
}