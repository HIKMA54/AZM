package com.azm.background

import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper

/**
 * Foreground service that keeps Azm's monitoring alive and, on an interval,
 * kicks the headless JS task to run detection. A foreground service is what
 * makes continuous background monitoring survive Doze and process pressure; the
 * ongoing (silent) notification is the OS requirement for that privilege.
 *
 * The heavy thinking happens in JS (via AzmTaskService); this class only keeps
 * time and stays alive.
 */
class AzmMonitorService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private val intervalMs = 15 * 60 * 1000L // 15 minutes

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
        handler.post(tick) // run one check now, then every interval
        return START_STICKY // ask the OS to restart us if killed
    }

    private fun runCheck() {
        try {
            startService(Intent(this, AzmTaskService::class.java))
        } catch (e: Exception) {
            // A tick that can't start (rare OS restriction) is simply skipped.
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