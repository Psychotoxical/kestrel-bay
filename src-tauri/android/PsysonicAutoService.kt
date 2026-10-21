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
    /** `MediaConstants.DESCRIPTION_EXTRAS_VALUE_CONTENT_STYLE_LIST_ITEM`. */
    private const val STYLE_LIST = 1

    /** The running service, while the car is connected. */
    private var current: PsysonicAutoService? = null

    /**
     * The web view can answer now. The car kept the "open Psysonic on your phone" list it
     * got before and never asked again until it was reconnected (car test 21.10.).
     */
    fun listsReady() {
      current?.notifyChildrenChanged(ROOT)
    }
  }

  override fun onCreate() {
    super.onCreate()
    current = this
    sessionToken = PsysonicMedia.sessionTokenFor(applicationContext)
    PsysonicMedia.onCarConnected(true)
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
      // build the lists. Say so instead of showing an empty screen.
      result.sendResult(mutableListOf(openOnPhoneItem()))
      return
    }
    result.detach()
    PsysonicMedia.requestCarList(parentId) { items -> result.sendResult(items.toMutableList()) }
  }

  private fun openOnPhoneItem(): MediaItem {
    val description = MediaDescriptionCompat.Builder()
      .setMediaId("open-on-phone")
      .setTitle(getString(R.string.app_name))
      .setSubtitle(getString(R.string.car_open_on_phone))
      .build()
    return MediaItem(description, MediaItem.FLAG_BROWSABLE)
  }
}
