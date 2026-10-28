// ⚠️ Android territory. Copied into the generated project by `patch-gen.mjs`; declared in
// the manifest by the same script, with `res/xml/automotive_app_desc.xml`.
//
// Android Auto: the car browses Psysonic through this service and plays through the
// MediaSession in PsysonicMedia (now playing, buttons, voice search). The lists are the
// same the CarPlay screen shows; the web view builds them (`mobileShell/car/carplayContent`,
// asked through `mobileShell/android/androidAuto.ts`).
package dev.psysonic.player

import android.os.Bundle
import android.support.v4.media.MediaBrowserCompat.MediaItem
import android.support.v4.media.MediaDescriptionCompat
import androidx.media.MediaBrowserServiceCompat

class PsysonicAutoService : MediaBrowserServiceCompat() {
  companion object {
    /** The root the car opens; its children become the tabs (Start, Playlists, …). */
    const val ROOT = "tabs"
    /**
     * The row that asks to open Psysonic on the phone. A tap plays (once the app is open):
     * as a folder it opened the Start tab as a page of its own, without the tabs, which
     * never refreshed (car test 21.10.).
     */
    const val OPEN_ON_PHONE = "open-on-phone"
    /** `MediaConstants.DESCRIPTION_EXTRAS_VALUE_CONTENT_STYLE_LIST_ITEM`. */
    private const val STYLE_LIST = 1

    /** The running service, while the car is connected. */
    private var current: PsysonicAutoService? = null

    /**
     * The web view can answer now. The car kept the "open Psysonic on your phone" lists it
     * got before and never asked again until it was reconnected (car test 21.10.): each of
     * them is told it changed.
     */
    fun listsReady() {
      val service = current ?: return
      val waiting = service.waiting.toList()
      service.waiting.clear()
      service.notifyChildrenChanged(ROOT)
      waiting.filter { it != ROOT }.forEach(service::notifyChildrenChanged)
    }

    /** The web view's lists changed (the Start tab after a song change); the car asks again. */
    fun listsChanged(nodes: List<String>) {
      val service = current ?: return
      nodes.forEach(service::notifyChildrenChanged)
    }
  }

  /** Lists answered with the "open on phone" row, to be refreshed once the web view is there. */
  private val waiting = HashSet<String>()

  override fun onCreate() {
    super.onCreate()
    current = this
    sessionToken = PsysonicMedia.sessionTokenFor(applicationContext)
    PsysonicMedia.onCarConnected(true)
    // Started by the car with Psysonic closed: open the app so the web view can build the
    // lists. Android only lets a background app do that with "display over other apps"
    // (S22 28.10.: BAL_BLOCK without it, the full lists after 2 s with it); without the
    // permission the car keeps the "open on phone" lists below.
    if (!PsysonicMedia.webReady()) {
      try {
        startActivity(
          android.content.Intent(this, MainActivity::class.java)
            .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK or android.content.Intent.FLAG_ACTIVITY_NO_ANIMATION),
        )
        android.util.Log.i("PsysonicAuto", "car start: startActivity sent")
      } catch (e: Exception) {
        android.util.Log.w("PsysonicAuto", "car start: startActivity threw $e")
      }
    }
  }

  override fun onDestroy() {
    if (current === this) current = null
    PsysonicMedia.onCarConnected(false)
    super.onDestroy()
  }

  // Rows are lists unless a row asks for a grid (the Start tab's cover rows); the car only
  // honours such per-row hints when the root says it uses content styles.
  override fun onGetRoot(clientPackageName: String, clientUid: Int, rootHints: Bundle?): BrowserRoot =
    BrowserRoot(ROOT, Bundle().apply {
      putBoolean("android.media.browse.CONTENT_STYLE_SUPPORTED", true)
      putInt("android.media.browse.CONTENT_STYLE_BROWSABLE_HINT", STYLE_LIST)
      putInt("android.media.browse.CONTENT_STYLE_PLAYABLE_HINT", STYLE_LIST)
    })

  override fun onLoadChildren(parentId: String, result: Result<MutableList<MediaItem>>) {
    if (!PsysonicMedia.webReady()) {
      // Started by the car with no Psysonic open on the phone: there is no web view yet to
      // build the lists. Without a copy (an app that never ran this far), the tabs come from
      // the last run, so the car keeps real tabs; their content says to open the app instead
      // of showing an empty screen.
      waiting += parentId
      // The copy the app left (androidAutoSnapshot.ts): its lists, played by PsysonicCarPlayer.
      PsysonicCarSnapshot.list(this, parentId)?.let { json ->
        result.sendResult(PsysonicMedia.carItems(json).toMutableList())
        return
      }
      val tabs = if (parentId == ROOT) PsysonicMedia.cachedCarTabs() else null
      result.sendResult((tabs ?: listOf(openOnPhoneItem())).toMutableList())
      return
    }
    result.detach()
    PsysonicMedia.requestCarList(parentId) { items -> result.sendResult(items.toMutableList()) }
  }

  private fun openOnPhoneItem(): MediaItem {
    val description = MediaDescriptionCompat.Builder()
      .setMediaId(OPEN_ON_PHONE)
      .setTitle(getString(R.string.app_name))
      .setSubtitle(getString(R.string.car_open_on_phone))
      .build()
    return MediaItem(description, MediaItem.FLAG_PLAYABLE)
  }
}
