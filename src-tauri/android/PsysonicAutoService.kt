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
  }

  override fun onCreate() {
    super.onCreate()
    sessionToken = PsysonicMedia.sessionTokenFor(applicationContext)
    PsysonicMedia.onCarConnected(true)
  }

  override fun onDestroy() {
    PsysonicMedia.onCarConnected(false)
    super.onDestroy()
  }

  override fun onGetRoot(clientPackageName: String, clientUid: Int, rootHints: Bundle?): BrowserRoot =
    BrowserRoot(ROOT, null)

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
      .setSubtitle("Open Psysonic on your phone once")
      .build()
    return MediaItem(description, MediaItem.FLAG_BROWSABLE)
  }
}
