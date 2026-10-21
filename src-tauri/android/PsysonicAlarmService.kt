// ⚠️ Android territory. Copied into the generated project by `patch-gen.mjs`; declared in
// the manifest by the same script (foregroundServiceType="mediaPlayback").
//
// Holds the app in the foreground while an alarm rings, with the alarm notification: shown
// full screen over the lock screen (or as a banner while the phone is in use), with Snooze
// and Stop.
package dev.psysonic.player

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject

class PsysonicAlarmService : Service() {
  companion object {
    private const val CHANNEL_ID = "alarm"
    private const val NOTIFICATION_ID = 7
    private const val EXTRA_ALARM = "alarm"

    fun start(ctx: Context, alarm: JSONObject) {
      val intent = Intent(ctx, PsysonicAlarmService::class.java).putExtra(EXTRA_ALARM, alarm.toString())
      runCatching { ContextCompat.startForegroundService(ctx, intent) }
    }

    fun stop(ctx: Context) {
      ctx.stopService(Intent(ctx, PsysonicAlarmService::class.java))
    }

    private fun build(ctx: Context, alarm: JSONObject): Notification {
      val nm = ctx.getSystemService(NotificationManager::class.java)
      if (nm.getNotificationChannel(CHANNEL_ID) == null) {
        nm.createNotificationChannel(
          NotificationChannel(CHANNEL_ID, ctx.getString(R.string.alarm_channel), NotificationManager.IMPORTANCE_HIGH)
            .apply { setSound(null, null); enableVibration(false) },
        )
      }
      val full = PendingIntent.getActivity(
        ctx, 2, PsysonicAlarm.ringIntent(ctx),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
      val time = "%02d:%02d".format(alarm.optInt("hour"), alarm.optInt("minute"))
      val label = alarm.optString("label").ifEmpty { ctx.getString(R.string.alarm_title) }
      return NotificationCompat.Builder(ctx, CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_stat_psysonic)
        .setContentTitle(time)
        .setContentText(label)
        .setCategory(NotificationCompat.CATEGORY_ALARM)
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setOngoing(true)
        // Not `setSilent`: Android only opens the full-screen intent for a notification that
        // alerts (the S22 stayed dark, 21.10.). The channel itself has no sound or vibration.
        .setContentIntent(full)
        .setFullScreenIntent(full, true)
        .addAction(0, ctx.getString(R.string.alarm_snooze), action(ctx, PsysonicAlarm.ACTION_SNOOZE, 3))
        .addAction(0, ctx.getString(R.string.alarm_stop), action(ctx, PsysonicAlarm.ACTION_STOP, 4))
        .build()
    }

    private fun action(ctx: Context, action: String, code: Int): PendingIntent = PendingIntent.getBroadcast(
      ctx, code,
      Intent(ctx, PsysonicAlarmReceiver::class.java).setAction(action),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val alarm = intent?.getStringExtra(EXTRA_ALARM)?.let { runCatching { JSONObject(it) }.getOrNull() }
      ?: JSONObject()
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
    } else {
      0
    }
    ServiceCompat.startForeground(this, NOTIFICATION_ID, build(this, alarm), type)
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null
}
