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
import android.support.v4.media.MediaBrowserCompat
import android.support.v4.media.MediaDescriptionCompat
import android.graphics.BitmapFactory
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.provider.MediaStore
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.content.ContextCompat
import androidx.core.graphics.drawable.toBitmap
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

  /** Android Auto may start before the app: the session exists from the first ask on. */
  fun sessionTokenFor(ctx: Context): MediaSessionCompat.Token {
    if (appContext == null) appContext = ctx.applicationContext
    return ensureSession(ctx.applicationContext).sessionToken
  }

  /** The web view's Android Auto half is listening (androidAuto.ts reports it). */
  private var carListsReady = false

  fun webReady(): Boolean = webView != null && carListsReady

  private fun setCarListsReady() {
    carListsReady = true
    PsysonicAutoService.listsReady()
    if (playWhenReady) {
      playWhenReady = false
      command("play")
    }
  }

  // ── Android Auto lists: asked of the web view (androidAuto.ts), answered by carListResult.
  private var nextCarRequest = 1
  private val carRequests = HashMap<Int, Pair<String, (List<MediaBrowserCompat.MediaItem>) -> Unit>>()
  /** Requests answered empty after the timeout, by id: a late answer refreshes their list. */
  private val lateCarRequests = HashMap<Int, String>()
  /** When a late answer last refreshed a list: a list that is always slow must not loop. */
  private val lateRefreshedAt = HashMap<String, Long>()

  fun requestCarList(node: String, reply: (List<MediaBrowserCompat.MediaItem>) -> Unit) {
    val view = webView ?: return reply(emptyList())
    val id = nextCarRequest++
    android.util.Log.i("PsysonicAuto", "list $node requested")
    carRequests[id] = node to reply
    view.evaluateJavascript(
      "window.__psyAutoList && window.__psyAutoList($id, ${JSONObject.quote(node)})",
      null,
    )
    // No answer (web view busy or gone): an empty list beats a car screen that spins. Right
    // after a start the library can be busy for longer (the Start tab stayed empty, car test
    // 21.10.): when the answer still comes, the car is told to ask again.
    main.postDelayed({
      carRequests.remove(id)?.let { (late, reply) ->
        android.util.Log.w("PsysonicAuto", "list $late: no answer after 10 s, sent empty")
        lateCarRequests[id] = late
        reply(emptyList())
      }
    }, 10_000)
  }

  /**
   * The tabs as the web view last sent them. A car that started Psysonic itself gets them
   * before the web view is there: the car keeps the tabs it got first, and a single "open
   * on phone" row in their place never turned into tabs (car test 21.10.).
   */
  fun cachedCarTabs(): List<MediaBrowserCompat.MediaItem>? {
    val json = appContext
      ?.getSharedPreferences(CAR_PREFS, Context.MODE_PRIVATE)
      ?.getString(CAR_TABS_KEY, null) ?: return null
    return runCatching { carItems(json) }.getOrNull()?.takeIf { it.isNotEmpty() }
  }

  private fun carListResult(id: Int, json: String) {
    val (node, reply) = carRequests.remove(id) ?: run {
      lateCarRequests.remove(id)?.let { late ->
        val now = SystemClock.elapsedRealtime()
        if (now - (lateRefreshedAt[late] ?: 0L) > 60_000) {
          android.util.Log.i("PsysonicAuto", "list $late: late answer, asking the car to reload")
          lateRefreshedAt[late] = now
          PsysonicAutoService.listsChanged(listOf(late))
        }
      }
      return
    }
    val items = carItems(json)
    if (node == PsysonicAutoService.ROOT && items.isNotEmpty()) {
      appContext?.getSharedPreferences(CAR_PREFS, Context.MODE_PRIVATE)
        ?.edit()?.putString(CAR_TABS_KEY, json)?.apply()
    }
    reply(items)
  }

  private const val CAR_PREFS = "psysonic_car"
  private const val CAR_TABS_KEY = "tabs"

  private fun carItems(json: String): List<MediaBrowserCompat.MediaItem> {
    val items = ArrayList<MediaBrowserCompat.MediaItem>()
    val sections = JSONObject(json).optJSONArray("sections")
    for (s in 0 until (sections?.length() ?: 0)) {
      val section = sections!!.getJSONObject(s)
      val header = section.optString("header").ifEmpty { null }
      val grid = section.optBoolean("grid")
      val rows = section.optJSONArray("items") ?: continue
      for (r in 0 until rows.length()) {
        val row = rows.getJSONObject(r)
        val description = MediaDescriptionCompat.Builder()
          .setMediaId(row.getString("node"))
          .setTitle(row.optString("title"))
          .setSubtitle(row.optString("subtitle").ifEmpty { null })
        val image = row.optString("image").ifEmpty { null }?.let { path -> carIcon(path) }
          ?: if (grid) moreIcon() else null
        image?.let(description::setIconBitmap)
        val extras = android.os.Bundle()
        header?.let { extras.putString(GROUP_TITLE, it) }
        if (grid) extras.putInt(SINGLE_ITEM_STYLE, STYLE_GRID)
        if (!extras.isEmpty) description.setExtras(extras)
        val flags = if (row.optBoolean("browse")) {
          MediaBrowserCompat.MediaItem.FLAG_BROWSABLE
        } else {
          MediaBrowserCompat.MediaItem.FLAG_PLAYABLE
        }
        items += MediaBrowserCompat.MediaItem(description.build(), flags)
      }
    }
    return items
  }

  /** Android Auto groups rows under this header (`MediaConstants.DESCRIPTION_EXTRAS_KEY_CONTENT_STYLE_GROUP_TITLE`). */
  private const val GROUP_TITLE = "android.media.browse.CONTENT_STYLE_GROUP_TITLE_HINT"

  /** Per-row style (`MediaConstants.DESCRIPTION_EXTRAS_KEY_CONTENT_STYLE_SINGLE_ITEM`): the Start tab's cover rows as a grid. */
  private const val SINGLE_ITEM_STYLE = "android.media.browse.CONTENT_STYLE_SINGLE_ITEM_HINT"
  private const val STYLE_GRID = 2

  /** The "show all" tile of a cover row; a tile without a picture shows a warning sign. */
  private fun moreIcon(): Bitmap? = appContext?.let { ctx ->
    runCatching { ContextCompat.getDrawable(ctx, R.drawable.ic_car_more)?.toBitmap(192, 192) }.getOrNull()
  }

  /** A cover from the app's cache, scaled down for a car list row. */
  private fun carIcon(path: String): Bitmap? = runCatching {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(path, bounds)
    var sample = 1
    while (bounds.outWidth / (sample * 2) >= 256) sample *= 2
    BitmapFactory.decodeFile(path, BitmapFactory.Options().apply { inSampleSize = sample })
  }.getOrNull()

  /**
   * The activity went to the background (screen off, another app). Wry pauses the web view
   * with it, which stops the page's timers: the queue would stop at the end of a track that
   * is not chained gapless. While music plays the web view stays running; paused, it rests.
   */
  fun onActivityPaused() {
    activityPaused = true
    if (keepWebAwake()) webView?.onResume()
  }

  /**
   * Android Auto is browsing (PsysonicAutoService is bound). The phone shows the car screen,
   * so Psysonic sits in the background with its web view paused, and a list that needs the
   * page's timers (an album, a playlist) would never answer. While the car is there the web
   * view stays running, as it does while music plays.
   */
  private var carConnected = false

  fun onCarConnected(connected: Boolean) {
    main.post {
      carConnected = connected
      refreshPlaybackState()
      if (activityPaused) {
        if (keepWebAwake()) webView?.onResume() else webView?.onPause()
      }
    }
  }

  private fun keepWebAwake() = playing || carConnected

  // ── Android Auto player buttons: shuffle, repeat, favourite and the infinite queue, as
  // custom actions. Only while a car is connected, so the phone's media notification keeps
  // its usual buttons. The web view reports their state (`setCarState`, androidAuto.ts).
  private var carShuffle = false
  private var carRepeat = "off"
  private var carStarred = false
  private var carInfinite = false

  private fun setCarState(json: String) {
    val o = JSONObject(json)
    carShuffle = o.optBoolean("shuffle")
    carRepeat = o.optString("repeat").ifEmpty { "off" }
    carStarred = o.optBoolean("starred")
    carInfinite = o.optBoolean("infinite")
    if (carConnected) refreshPlaybackState()
  }

  private fun carAction(ctx: Context, id: String, name: Int, icon: Int) =
    PlaybackStateCompat.CustomAction.Builder(id, ctx.getString(name), icon).build()

  private fun playbackState(state: Int, positionMs: Long, speed: Float, updatedAt: Long): PlaybackStateCompat {
    val builder = PlaybackStateCompat.Builder().setActions(ACTIONS).setState(state, positionMs, speed, updatedAt)
    val ctx = appContext
    if (carConnected && ctx != null) {
      builder.addCustomAction(carAction(ctx, "shuffle", R.string.car_shuffle,
        if (carShuffle) R.drawable.ic_car_shuffle_on else R.drawable.ic_car_shuffle_off))
      builder.addCustomAction(carAction(ctx, "repeat", R.string.car_repeat, when (carRepeat) {
        "all" -> R.drawable.ic_car_repeat_all
        "one" -> R.drawable.ic_car_repeat_one
        else -> R.drawable.ic_car_repeat_off
      }))
      builder.addCustomAction(carAction(ctx, "star", R.string.car_favorite,
        if (carStarred) R.drawable.ic_car_heart_filled else R.drawable.ic_car_heart))
      builder.addCustomAction(carAction(ctx, "infinite", R.string.car_infinite,
        if (carInfinite) R.drawable.ic_car_infinite_on else R.drawable.ic_car_infinite_off))
    }
    return builder.build()
  }

  /** Same play state and position, buttons redrawn. */
  private fun refreshPlaybackState() {
    val s = session ?: return
    val current = s.controller.playbackState ?: return
    s.setPlaybackState(
      playbackState(current.state, current.position, current.playbackSpeed, current.lastPositionUpdateTime),
    )
  }

  fun onActivityResumed() {
    activityPaused = false
  }

  /**
   * Android Auto starts playback as it connects ("start music automatically"), before a
   * Psysonic it launched itself has a web view: the press was lost and the restored song sat
   * paused while the car waited for sound (car test 21.10.). It is played once the page is up.
   */
  private var playWhenReady = false

  /** A button from the lock screen, notification or a headset: hand it to the web view. */
  fun command(name: String, seconds: Double = 0.0) {
    main.post {
      if (!webReady()) {
        playWhenReady = name == "play" || (playWhenReady && name != "pause" && name != "stop")
        return@post
      }
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
        // Android Auto's own buttons (shuffle, repeat, favourite, infinite queue).
        override fun onCustomAction(action: String?, extras: android.os.Bundle?) {
          action?.let { js("window.__psyAutoCommand && window.__psyAutoCommand(${JSONObject.quote(it)})") }
        }
        // Android Auto: a list row, or "Play … on Psysonic" by voice.
        override fun onPlayFromMediaId(mediaId: String?, extras: android.os.Bundle?) {
          when (mediaId) {
            null -> {}
            PsysonicAutoService.OPEN_ON_PHONE -> command("play")
            else -> js("window.__psyAutoPlay && window.__psyAutoPlay(${JSONObject.quote(mediaId)})")
          }
        }
        // "Play … on Psysonic": the spoken text, plus what the assistant made of it (a song,
        // album, artist or playlist and its fields), handed on like a Siri request.
        override fun onPlayFromSearch(query: String?, extras: android.os.Bundle?) {
          val request = JSONObject()
            .put("query", query ?: "")
            .put("focus", extras?.getString(MediaStore.EXTRA_MEDIA_FOCUS) ?: "")
            .put("title", extras?.getString(MediaStore.EXTRA_MEDIA_TITLE) ?: "")
            .put("artist", extras?.getString(MediaStore.EXTRA_MEDIA_ARTIST) ?: "")
            .put("album", extras?.getString(MediaStore.EXTRA_MEDIA_ALBUM) ?: "")
            .put("playlist", extras?.getString(MediaStore.EXTRA_MEDIA_PLAYLIST) ?: "")
          js("window.__psyAutoSearch && window.__psyAutoSearch($request)")
        }
      })
      // Android Auto only offers the app once the session states what it can do.
      s.setPlaybackState(
        PlaybackStateCompat.Builder().setActions(ACTIONS)
          .setState(PlaybackStateCompat.STATE_NONE, 0, 0f).build(),
      )
      s.isActive = true
      session = s
    }

  private const val ACTIONS =
    PlaybackStateCompat.ACTION_PLAY or PlaybackStateCompat.ACTION_PAUSE or
      PlaybackStateCompat.ACTION_PLAY_PAUSE or PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
      PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or PlaybackStateCompat.ACTION_SEEK_TO or
      PlaybackStateCompat.ACTION_STOP or PlaybackStateCompat.ACTION_PLAY_FROM_MEDIA_ID or
      PlaybackStateCompat.ACTION_PLAY_FROM_SEARCH

  private fun js(script: String) {
    main.post { webView?.evaluateJavascript(script, null) }
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
      playbackState(state, positionMs.coerceAtLeast(0), if (isPlaying) 1f else 0f, SystemClock.elapsedRealtime()),
    )
    if (isPlaying == playing && PsysonicMediaService.running) return
    playing = isPlaying
    if (activityPaused) {
      if (keepWebAwake()) webView?.onResume() else webView?.onPause()
    }
    if (isPlaying) {
      main.removeCallbacks(releaseAfterPause)
      if (!radio) requestFocus(ctx)
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

  /**
   * Radio plays through the web view's audio element, and Chromium asks for audio focus for
   * it on its own, which takes focus from this session; answering that with a pause stopped
   * every station right after it started (car test 21.10.). While radio plays, Chromium owns
   * focus and pauses the element itself for calls; this session neither asks nor reacts.
   */
  private var radio = false
  private const val FOCUS_LOSS_GRACE_MS = 800L

  private fun setRadio(isRadio: Boolean) {
    radio = isRadio
  }

  // ── Audio focus: a call or another player takes the speaker → pause (and resume after a call).
  private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
    if (radio) return@OnAudioFocusChangeListener
    when (change) {
      // The radio's own focus request can race the web view's report that a station is
      // starting, so a loss waits a moment and is dropped if it was the radio.
      AudioManager.AUDIOFOCUS_LOSS -> main.postDelayed({
        if (radio) return@postDelayed
        resumeOnFocusGain = false
        if (playing) command("pause")
      }, FOCUS_LOSS_GRACE_MS)
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> main.postDelayed({
        if (radio) return@postDelayed
        resumeOnFocusGain = playing
        if (playing) command("pause")
      }, FOCUS_LOSS_GRACE_MS)
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

    @JavascriptInterface
    fun carListsReady() {
      main.post { PsysonicMedia.setCarListsReady() }
    }

    @JavascriptInterface
    fun carListsChanged(nodesJson: String) {
      main.post {
        runCatching {
          val nodes = org.json.JSONArray(nodesJson)
          PsysonicAutoService.listsChanged((0 until nodes.length()).map(nodes::getString))
        }
      }
    }

    @JavascriptInterface
    fun setRadio(radio: Boolean) {
      main.post { PsysonicMedia.setRadio(radio) }
    }

    @JavascriptInterface
    fun setCarState(json: String) {
      main.post { runCatching { PsysonicMedia.setCarState(json) } }
    }

    @JavascriptInterface
    fun carListResult(id: Int, json: String) {
      main.post { runCatching { PsysonicMedia.carListResult(id, json) } }
    }
  }
}
