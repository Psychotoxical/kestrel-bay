// ⚠️ Android territory. Copied into the generated project by `patch-gen.mjs`; declared in
// the manifest by the same script (foregroundServiceType="mediaPlayback").
//
// Holds the app in the foreground while music plays: without it Android stops background
// apps and cuts their network once the screen is off, so the next track never loads. Its
// notification is the media notification (cover, title, previous / play-pause / next),
// which also feeds the lock screen through the MediaSession in PsysonicMedia.
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
import androidx.media.app.NotificationCompat.MediaStyle

class PsysonicMediaService : Service() {
  companion object {
    private const val CHANNEL_ID = "playback"
    private const val NOTIFICATION_ID = 1
    private const val ACTION_PREV = "dev.psysonic.player.PREV"
    private const val ACTION_TOGGLE = "dev.psysonic.player.TOGGLE"
    private const val ACTION_NEXT = "dev.psysonic.player.NEXT"

    @Volatile
    var running = false
      private set

    private var instance: PsysonicMediaService? = null

    /**
     * After a long pause: leave the foreground, remove the notification and stop. A media
     * notification cannot be swiped away while its session lives (Android 13+), so it goes.
     * The session stays: a headset button or the app resumes and the service comes back.
     */
    fun release() {
      val service = instance ?: return
      ServiceCompat.stopForeground(service, ServiceCompat.STOP_FOREGROUND_REMOVE)
      service.stopSelf()
    }

    /** Redraw the notification after the title, cover or play state changed. */
    fun refresh(ctx: Context) {
      if (!running) return
      ctx.getSystemService(NotificationManager::class.java)
        .notify(NOTIFICATION_ID, build(ctx))
    }

    private fun build(ctx: Context): Notification {
      ensureChannel(ctx)
      val open = PendingIntent.getActivity(
        ctx, 0,
        Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
      val playing = PsysonicMedia.playing
      val style = MediaStyle().setShowActionsInCompactView(0, 1, 2)
      PsysonicMedia.sessionToken()?.let { style.setMediaSession(it) }
      return NotificationCompat.Builder(ctx, CHANNEL_ID)
        .setSmallIcon(if (playing) android.R.drawable.ic_media_play else android.R.drawable.ic_media_pause)
        .setContentTitle(PsysonicMedia.title ?: "Psysonic")
        .setContentText(PsysonicMedia.artist)
        .setLargeIcon(PsysonicMedia.cover)
        .setContentIntent(open)
        .setOngoing(playing)
        .setOnlyAlertOnce(true)
        .setSilent(true)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
        .addAction(android.R.drawable.ic_media_previous, "Previous", action(ctx, ACTION_PREV, 1))
        .addAction(
          if (playing) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
          if (playing) "Pause" else "Play",
          action(ctx, ACTION_TOGGLE, 2),
        )
        .addAction(android.R.drawable.ic_media_next, "Next", action(ctx, ACTION_NEXT, 3))
        .setStyle(style)
        .build()
    }

    private fun action(ctx: Context, name: String, code: Int): PendingIntent =
      PendingIntent.getService(
        ctx, code, Intent(ctx, PsysonicMediaService::class.java).setAction(name),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )

    private fun ensureChannel(ctx: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val nm = ctx.getSystemService(NotificationManager::class.java)
      if (nm.getNotificationChannel(CHANNEL_ID) != null) return
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Playback", NotificationManager.IMPORTANCE_LOW).apply {
          setShowBadge(false)
        },
      )
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // startForegroundService() requires startForeground() on every start, also for buttons.
    ServiceCompat.startForeground(
      this, NOTIFICATION_ID, build(this),
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK else 0,
    )
    running = true
    instance = this
    when (intent?.action) {
      ACTION_PREV -> PsysonicMedia.command("prev")
      ACTION_TOGGLE -> PsysonicMedia.command(if (PsysonicMedia.playing) "pause" else "play")
      ACTION_NEXT -> PsysonicMedia.command("next")
    }
    return START_NOT_STICKY
  }

  override fun onTimeout(startId: Int, fgsType: Int) {
    stopSelf()
  }

  // Swiped away from the recent apps while paused: nothing left to keep alive.
  override fun onTaskRemoved(rootIntent: Intent?) {
    if (!PsysonicMedia.playing) {
      ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
      stopSelf()
    }
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    running = false
    instance = null
    super.onDestroy()
  }
}
