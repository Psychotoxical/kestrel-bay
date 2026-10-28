// ⚠️ Android territory. Copied into the generated project by `patch-gen.mjs`.
//
// The car's own player, for a car start with Psysonic closed: there is no web view then, and
// with it no player (`mobileShell/android/androidAutoSnapshot.ts`). It plays what the web view
// left in PsysonicCarSnapshot with Media3's ExoPlayer and reports through PsysonicMedia's
// session (car screen, lock screen, notification), as the web view does. Once the app is open
// the web view takes over its queue and position (`handover`) and this player stops.
// Plain playback: no crossfade, no loudness levelling, no gapless chaining.
package dev.psysonic.player

import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.provider.MediaStore
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import java.io.File
import org.json.JSONArray
import org.json.JSONObject

object PsysonicCarPlayer {
  private const val TAG = "PsysonicCarPlayer"
  private const val LOCAL_PREFIX = "psysonic-local://"
  /** A play counts once half the song (at most four minutes) was heard, as in the app. */
  private const val SCROBBLE_MAX_MS = 4 * 60 * 1000L

  private var player: ExoPlayer? = null
  /** The playing list, as the copy holds it (`CarSnapshotTrack`). */
  private var queue: List<JSONObject> = emptyList()
  private var radio = false
  /** Songs heard far enough to count, for the app to scrobble after the handover. */
  private val played = JSONArray()
  private var heardMs = 0L
  private var heardSince = 0L
  private var trackStartedAt = 0L

  /** This player has a queue: commands and the handover are its. */
  val active: Boolean get() = player != null && queue.isNotEmpty()

  private var appContext: Context? = null

  private fun ensurePlayer(ctx: Context): ExoPlayer = player ?: ExoPlayer.Builder(ctx.applicationContext.also { appContext = it })
    // PsysonicMedia asks for audio focus and answers its loss, as for the web view's player.
    .setAudioAttributes(
      AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),
      false,
    )
    .setWakeMode(C.WAKE_MODE_NETWORK)
    .build()
    .also { p ->
      p.addListener(listener)
      player = p
    }

  private val listener = object : Player.Listener {
    override fun onIsPlayingChanged(isPlaying: Boolean) {
      val now = SystemClock.elapsedRealtime()
      if (isPlaying) heardSince = now else if (heardSince > 0) { heardMs += now - heardSince; heardSince = 0 }
      report()
    }

    override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
      countHeard()
      trackStartedAt = System.currentTimeMillis()
      metadata()
      report()
    }

    override fun onPlaybackStateChanged(state: Int) {
      if (state == Player.STATE_ENDED) countHeard()
      report()
    }

    override fun onPositionDiscontinuity(old: Player.PositionInfo, new: Player.PositionInfo, reason: Int) = report()

    override fun onPlayerError(error: PlaybackException) {
      android.util.Log.w(TAG, "song failed: ${error.errorCodeName}")
      val p = player ?: return
      if (p.hasNextMediaItem()) {
        p.seekToNextMediaItem()
        p.prepare()
        p.play()
      } else {
        report()
      }
    }
  }

  /** The song that just ended or was left counts once it was heard far enough. */
  private fun countHeard() {
    val p = player ?: return
    if (radio || trackStartedAt == 0L) return
    val now = SystemClock.elapsedRealtime()
    val heard = heardMs + if (heardSince > 0) now - heardSince else 0
    heardMs = 0
    heardSince = if (p.isPlaying) now else 0
    val entry = lastTrack ?: return
    val durationMs = (entry.optJSONObject("track")?.optDouble("duration", 0.0) ?: 0.0) * 1000
    val needed = if (durationMs > 0) minOf(durationMs.toLong() / 2, SCROBBLE_MAX_MS) else SCROBBLE_MAX_MS
    if (heard >= needed) {
      played.put(JSONObject().put("track", entry.getJSONObject("track")).put("startedAtMs", trackStartedAt))
    }
  }

  /** The song whose time `heardMs` counts: the one before the transition. */
  private var lastTrack: JSONObject? = null

  private fun metadata() {
    val p = player ?: return
    val entry = queue.getOrNull(p.currentMediaItemIndex) ?: return
    lastTrack = entry
    val track = entry.optJSONObject("track") ?: JSONObject()
    PsysonicMedia.showNative(
      title = if (radio) entry.optString("name") else track.optString("title"),
      artist = track.optString("artist"),
      album = track.optString("album"),
      durationSecs = track.optDouble("duration", 0.0),
      // The queue to resume carries no covers; the copy's album rows usually do.
      coverPath = entry.optString("cover").ifEmpty {
        appContext?.let { PsysonicCarSnapshot.albumCover(it, track.optString("albumId")) } ?: ""
      },
    )
  }

  private fun report() {
    val p = player ?: return
    val playing = p.playWhenReady && p.playbackState != Player.STATE_ENDED && p.playbackState != Player.STATE_IDLE
    PsysonicMedia.reportNative(playing, p.currentPosition)
  }

  private fun uriFor(entry: JSONObject): Uri {
    val url = entry.optString("url")
    if (url.startsWith(LOCAL_PREFIX)) {
      val file = File(url.removePrefix(LOCAL_PREFIX))
      if (file.exists()) return Uri.fromFile(file)
      return Uri.parse(entry.optString("stream"))
    }
    return Uri.parse(url)
  }

  private fun start(ctx: Context, entries: List<JSONObject>, index: Int, positionMs: Long = 0, isRadio: Boolean = false): Boolean {
    if (entries.isEmpty()) return false
    val p = ensurePlayer(ctx)
    countHeard()
    queue = entries
    radio = isRadio
    lastTrack = null
    trackStartedAt = 0
    p.setMediaItems(entries.map { MediaItem.fromUri(uriFor(it)) }, index.coerceIn(0, entries.size - 1), positionMs)
    p.prepare()
    p.play()
    trackStartedAt = System.currentTimeMillis()
    metadata()
    android.util.Log.i(TAG, "playing ${entries.size} songs from ${index.coerceIn(0, entries.size - 1)}")
    return true
  }

  private fun entries(array: JSONArray?): List<JSONObject> =
    array?.let { a -> (0 until a.length()).map(a::getJSONObject) } ?: emptyList()

  private val nodeKind = { node: String -> node.substringBefore('|') }
  private val nodeParts = { node: String -> node.split('|').drop(1).map(Uri::decode) }

  /** A row the car tapped, from the copy. False when the copy cannot play it. */
  fun playNode(ctx: Context, mediaId: String): Boolean {
    val parts = nodeParts(mediaId)
    val first = parts.firstOrNull() ?: ""
    return when (nodeKind(mediaId)) {
      "playall" -> start(ctx, entries(PsysonicCarSnapshot.plays(ctx, first)), 0)
      "shuffle" -> start(ctx, entries(PsysonicCarSnapshot.plays(ctx, first)).shuffled(), 0)
      "track" -> start(ctx, entries(PsysonicCarSnapshot.plays(ctx, first)), parts.getOrNull(1)?.toIntOrNull() ?: 0)
      "random", "luckymix" -> start(ctx, entries(PsysonicCarSnapshot.plays(ctx, "random")).shuffled(), 0)
      "favplay" -> start(ctx, entries(PsysonicCarSnapshot.plays(ctx, "favorites")).shuffled(), 0)
      "offline" -> start(ctx, entries(PsysonicCarSnapshot.plays(ctx, mediaId)), 0)
      "radio" -> PsysonicCarSnapshot.station(ctx, first)?.let { station ->
        start(ctx, listOf(JSONObject().put("url", station.optString("url")).put("name", station.optString("name"))), 0, isRadio = true)
      } ?: false
      else -> resume(ctx)
    }
  }

  /** The queue the app last played, from where it stopped. */
  fun resume(ctx: Context): Boolean {
    if (active) {
      player?.play()
      return true
    }
    val resume = PsysonicCarSnapshot.resume(ctx) ?: return false
    val positionMs = (resume.optDouble("positionSecs", 0.0) * 1000).toLong()
    return start(ctx, entries(resume.optJSONArray("tracks")), resume.optInt("index"), positionMs)
  }

  /**
   * "Play … on Psysonic" with the app closed: an album or playlist of the copy by its name,
   * then a song by its title; anything else resumes.
   */
  fun search(ctx: Context, query: String?, extras: Bundle?) {
    val wanted = listOfNotNull(
      extras?.getString(MediaStore.EXTRA_MEDIA_PLAYLIST),
      extras?.getString(MediaStore.EXTRA_MEDIA_ALBUM),
      extras?.getString(MediaStore.EXTRA_MEDIA_TITLE),
      query,
    ).map { it.trim().lowercase() }.filter { it.isNotEmpty() }
    val lists = PsysonicCarSnapshot.lists(ctx)
    if (lists != null) {
      for (name in wanted) {
        for (key in lists.keys()) {
          val sections = lists.getJSONObject(key).optJSONArray("sections") ?: continue
          for (s in 0 until sections.length()) {
            val rows = sections.getJSONObject(s).optJSONArray("items") ?: continue
            for (r in 0 until rows.length()) {
              val row = rows.getJSONObject(r)
              val node = row.optString("node")
              val kind = nodeKind(node)
              if ((kind == "album" || kind == "playlist") && row.optString("title").lowercase() == name &&
                PsysonicCarSnapshot.plays(ctx, node) != null
              ) {
                start(ctx, entries(PsysonicCarSnapshot.plays(ctx, node)), 0)
                return
              }
            }
          }
        }
        for (key in lists.keys()) {
          val tracks = entries(PsysonicCarSnapshot.plays(ctx, key))
          val at = tracks.indexOfFirst { it.optJSONObject("track")?.optString("title")?.lowercase() == name }
          if (at >= 0) {
            start(ctx, tracks, at)
            return
          }
        }
      }
    }
    resume(ctx)
  }

  /** A button from the car, the lock screen or a headset. */
  fun command(ctx: Context, name: String, seconds: Double) {
    val p = player
    when (name) {
      "play" -> if (active) p?.play() else resume(ctx)
      "pause", "stop" -> p?.pause()
      "next" -> if (p?.hasNextMediaItem() == true) p.seekToNextMediaItem()
      "prev" -> p?.let { if (it.currentPosition > 3000 || !it.hasPreviousMediaItem()) it.seekTo(0) else it.seekToPreviousMediaItem() }
      "seek" -> p?.seekTo((seconds * 1000).toLong())
    }
  }

  /**
   * The app is open: its player takes the queue from here. Returns what it needs (the queue,
   * where it stood, whether it played, the songs to scrobble) and stops this player.
   */
  fun handover(): String? {
    val p = player ?: return null
    if (queue.isEmpty() || radio) {
      release()
      return null
    }
    val json = JSONObject()
      .put("tracks", JSONArray(queue.map { it.getJSONObject("track") }))
      .put("index", p.currentMediaItemIndex)
      .put("positionSecs", p.currentPosition / 1000.0)
      .put("playing", p.isPlaying)
      .put("played", JSONArray(played.toString()))
    release()
    return json.toString()
  }

  /** The app plays something of its own: this player stops, its queue is dropped. */
  fun stop() {
    val p = player ?: return
    PsysonicMedia.reportNative(false, p.currentPosition)
    release()
  }

  private fun release() {
    player?.removeListener(listener)
    player?.release()
    player = null
    queue = emptyList()
    radio = false
    lastTrack = null
    heardMs = 0
    heardSince = 0
    trackStartedAt = 0
    while (played.length() > 0) played.remove(0)
  }
}
