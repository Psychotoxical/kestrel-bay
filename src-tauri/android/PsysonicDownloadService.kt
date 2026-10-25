// ⚠️ Android territory. Copied into the generated project by `patch-gen.mjs`; declared in
// the manifest by the same script (foregroundServiceType="dataSync").
//
// Holds the app in the foreground while a whole library downloads and no music plays.
// Without it Android ranks Psysonic a cached background app once the screen is off: the
// download ran at half speed (S22, 25.10.) and the process may be stopped at any time. The
// notification text comes from the web view (localised there); tapping it opens the app.
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

class PsysonicDownloadService : Service() {
  companion object {
    private const val CHANNEL_ID = "downloads"
    private const val NOTIFICATION_ID = 3

    @Volatile
    var running = false
      private set

    private var instance: PsysonicDownloadService? = null

    fun stop() {
      val service = instance ?: return
      ServiceCompat.stopForeground(service, ServiceCompat.STOP_FOREGROUND_REMOVE)
      service.stopSelf()
    }

    /** Redraw the notification after its text changed. */
    fun refresh(ctx: Context) {
      if (!running) return
      ctx.getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, build(ctx))
    }

    private fun build(ctx: Context): Notification {
      ensureChannel(ctx)
      val open = PendingIntent.getActivity(
        ctx, 0,
        Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
      return NotificationCompat.Builder(ctx, CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_stat_psysonic)
        .setContentTitle(PsysonicMedia.downloadTitle.ifEmpty { "Psysonic" })
        .setContentText(PsysonicMedia.downloadText)
        .setContentIntent(open)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setSilent(true)
        .setCategory(NotificationCompat.CATEGORY_PROGRESS)
        .build()
    }

    private fun ensureChannel(ctx: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val nm = ctx.getSystemService(NotificationManager::class.java)
      if (nm.getNotificationChannel(CHANNEL_ID) != null) return
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Downloads", NotificationManager.IMPORTANCE_LOW).apply {
          setShowBadge(false)
        },
      )
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    ServiceCompat.startForeground(
      this, NOTIFICATION_ID, build(this),
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC else 0,
    )
    running = true
    instance = this
    return START_NOT_STICKY
  }

  // Android 15 allows data sync six hours a day; past that the download goes on as a
  // background app (slower, until the app is in front again or music plays).
  override fun onTimeout(startId: Int, fgsType: Int) {
    stop()
  }

  override fun onDestroy() {
    running = false
    instance = null
    super.onDestroy()
  }
}
