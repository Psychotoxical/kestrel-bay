// ⚠️ Android territory. Copied into the generated project by `patch-gen.mjs`.
//
// The player lives in the web view and in Rust; Android only learns about it through
// this bridge. The web view reports what plays (`PsysonicAndroidMedia` JavaScript
// interface); this object mirrors it into a MediaSession (lock screen, notification,
// Bluetooth and headset buttons) and keeps PsysonicMediaService in the foreground while
// music plays, so Android neither stops the app nor cuts its network with the screen off.
// Buttons travel back as `window.__psyAndroidMediaCommand(name, seconds)`.
package dev.psysonic.player

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.content.ContextCompat
import org.json.JSONObject

object PsysonicMedia {
  private val main = Handler(Looper.getMainLooper())
  private var appContext: Context? = null
  private var webView: WebView? = null
  private var session: MediaSessionCompat? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var focusRequest: AudioFocusRequest? = null
  private var noisyRegistered = false
  private var resumeOnFocusGain = false
  private var activityPaused = false

  /** How long a pause keeps the service (and quick resume from a headset) in place. */
  private const val RELEASE_AFTER_PAUSE_MS = 10 * 60 * 1000L
  private val releaseAfterPause = Runnable { if (!playing) PsysonicMediaService.release() }

  var playing = false
    private set
  var title: String? = null
    private set
  var artist: String? = null
    private set
  var cover: Bitmap? = null
    private set

  fun attach(activity: MainActivity, view: WebView) {
    appContext = activity.applicationContext
    webView = view
    view.addJavascriptInterface(JsBridge, "PsysonicAndroidMedia")
    // The queue lives in this web view. By default Android demotes its renderer process
    // once the view is off screen and may freeze it, so the next track never starts. Keep
    // it at the app's own priority, which the playback service holds up while music plays.
    view.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false)
  }

  fun sessionToken(): MediaSessionCompat.Token? = session?.sessionToken

  /**
   * The activity went to the background (screen off, another app). Wry pauses the web view
   * with it, which stops the page's timers: the queue would stop at the end of a track that
   * is not chained gapless. While music plays the web view stays running; paused, it rests.
   */
  fun onActivityPaused() {
    activityPaused = true
    if (playing) webView?.onResume()
  }

  fun onActivityResumed() {
    activityPaused = false
  }

  /** A button from the lock screen, notification or a headset: hand it to the web view. */
  fun command(name: String, seconds: Double = 0.0) {
    main.post {
      webView?.evaluateJavascript(
        "window.__psyAndroidMediaCommand && window.__psyAndroidMediaCommand('$name', $seconds)",
        null,
      )
    }
  }

  private fun ensureSession(ctx: Context): MediaSessionCompat =
    session ?: MediaSessionCompat(ctx, "Psysonic").also { s ->
      s.setCallback(object : MediaSessionCompat.Callback() {
        override fun onPlay() = command("play")
        override fun onPause() = command("pause")
        override fun onSkipToNext() = command("next")
        override fun onSkipToPrevious() = command("prev")
        override fun onStop() = command("pause")
        override fun onSeekTo(pos: Long) = command("seek", pos / 1000.0)
      })
      s.isActive = true
      session = s
    }

  private fun setMetadata(json: String) {
    val ctx = appContext ?: return
    val o = JSONObject(json)
    title = o.optString("title").ifEmpty { null }
    artist = o.optString("artist").ifEmpty { null }
    val album = o.optString("album").ifEmpty { null }
    val durationMs = (o.optDouble("durationSecs", 0.0) * 1000).toLong()
    // Only covers from the app's own cache: remote cover URLs carry the server login.
    cover = o.optString("coverPath").ifEmpty { null }?.let { path ->
      runCatching { BitmapFactory.decodeFile(path) }.getOrNull()
    }
    val meta = MediaMetadataCompat.Builder()
      .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
      .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
      .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, album)
    if (durationMs > 0) meta.putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs)
    cover?.let { meta.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, it) }
    ensureSession(ctx).setMetadata(meta.build())
    if (playing || PsysonicMediaService.running) PsysonicMediaService.refresh(ctx)
  }

  private fun setPlayback(isPlaying: Boolean, positionMs: Long) {
    val ctx = appContext ?: return
    val s = ensureSession(ctx)
    val state = if (isPlaying) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED
    s.setPlaybackState(
      PlaybackStateCompat.Builder()
        .setActions(
          PlaybackStateCompat.ACTION_PLAY or PlaybackStateCompat.ACTION_PAUSE or
            PlaybackStateCompat.ACTION_PLAY_PAUSE or PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
            PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or PlaybackStateCompat.ACTION_SEEK_TO or
            PlaybackStateCompat.ACTION_STOP,
        )
        .setState(state, positionMs.coerceAtLeast(0), if (isPlaying) 1f else 0f, SystemClock.elapsedRealtime())
        .build(),
    )
    if (isPlaying == playing && PsysonicMediaService.running) return
    playing = isPlaying
    if (activityPaused) {
      if (isPlaying) webView?.onResume() else webView?.onPause()
    }
    if (isPlaying) {
      main.removeCallbacks(releaseAfterPause)
      requestFocus(ctx)
      registerNoisy(ctx)
      acquireWakeLock(ctx)
      // Android refuses a foreground start from the background unless the user just acted
      // (e.g. a resume by headset long after the service was released); play on without it.
      runCatching {
        ContextCompat.startForegroundService(ctx, Intent(ctx, PsysonicMediaService::class.java))
      }
    } else {
      unregisterNoisy(ctx)
      releaseWakeLock()
      if (PsysonicMediaService.running) PsysonicMediaService.refresh(ctx)
      main.removeCallbacks(releaseAfterPause)
      main.postDelayed(releaseAfterPause, RELEASE_AFTER_PAUSE_MS)
    }
  }

  // ── Audio focus: a call or another player takes the speaker → pause (and resume after a call).
  private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
    when (change) {
      AudioManager.AUDIOFOCUS_LOSS -> { resumeOnFocusGain = false; if (playing) command("pause") }
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> { resumeOnFocusGain = playing; if (playing) command("pause") }
      AudioManager.AUDIOFOCUS_GAIN -> { if (resumeOnFocusGain && !playing) command("play"); resumeOnFocusGain = false }
      // Ducking for navigation prompts is done by the system for media streams.
    }
  }

  private fun requestFocus(ctx: Context) {
    val am = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    val req = focusRequest ?: AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
          .build(),
      )
      .setOnAudioFocusChangeListener(focusListener, main)
      .build().also { focusRequest = it }
    am.requestAudioFocus(req)
  }

  // ── Headphones unplugged / Bluetooth gone → pause, like every music app.
  private val noisyReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      if (intent.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) command("pause")
    }
  }

  private fun registerNoisy(ctx: Context) {
    if (noisyRegistered) return
    ContextCompat.registerReceiver(
      ctx, noisyReceiver, IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY),
      ContextCompat.RECEIVER_NOT_EXPORTED,
    )
    noisyRegistered = true
  }

  private fun unregisterNoisy(ctx: Context) {
    if (!noisyRegistered) return
    runCatching { ctx.unregisterReceiver(noisyReceiver) }
    noisyRegistered = false
  }

  // ── Keep the CPU up between tracks (the next one loads over the network).
  private fun acquireWakeLock(ctx: Context) {
    val lock = wakeLock ?: (ctx.getSystemService(Context.POWER_SERVICE) as PowerManager)
      .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Psysonic:playback")
      .also { it.setReferenceCounted(false); wakeLock = it }
    if (!lock.isHeld) lock.acquire()
  }

  private fun releaseWakeLock() {
    wakeLock?.let { if (it.isHeld) it.release() }
  }

  /** Called from the web view's JavaScript thread; everything else runs on the main thread. */
  private object JsBridge {
    @JavascriptInterface
    fun setMetadata(json: String) {
      main.post { runCatching { PsysonicMedia.setMetadata(json) } }
    }

    @JavascriptInterface
    fun setPlayback(isPlaying: Boolean, positionSecs: Double) {
      main.post { runCatching { PsysonicMedia.setPlayback(isPlaying, (positionSecs * 1000).toLong()) } }
    }
  }
}
