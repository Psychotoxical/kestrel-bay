// ⚠️ Android territory. Copied over Tauri's generated MainActivity by `patch-gen.mjs`
// (the generated project under `src-tauri/gen/android` is not in git).
package dev.psysonic.player

import android.graphics.Color
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Psysonic's default themes are dark; the web view corrects this once a theme loads.
    applySystemBars(dark = true)
    super.onCreate(savedInstanceState)
  }

  // Lock screen, notification and headset buttons (see PsysonicMedia), and the theme's
  // brightness for the system bars (see androidSystemBars.ts).
  override fun onWebViewCreate(webView: WebView) {
    PsysonicMedia.attach(this, webView)
    webView.addJavascriptInterface(ShellBridge(this), "PsysonicAndroidShell")
  }

  /**
   * The app draws behind the status and navigation bars: their icons follow the theme,
   * light on a dark background and dark on a light one, with no tinted strip behind them.
   * Samsung did this on its own, other makers (Honor) kept dark icons on the dark app.
   */
  fun applySystemBars(dark: Boolean) {
    val style = if (dark) {
      SystemBarStyle.dark(Color.TRANSPARENT)
    } else {
      SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
    }
    enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
  }

  private class ShellBridge(private val activity: MainActivity) {
    @JavascriptInterface
    fun setDarkBackground(dark: Boolean) {
      activity.runOnUiThread { activity.applySystemBars(dark) }
    }
  }

  // Wry pauses the web view with the activity (screen off, app in the background); a
  // paused page stops its timers, and the player needs them (next track, crossfade).
  override fun onPause() {
    super.onPause()
    PsysonicMedia.onActivityPaused()
  }

  override fun onResume() {
    super.onResume()
    PsysonicMedia.onActivityResumed()
  }

  // Wry steps the web view back through its history and calls this once there is nothing
  // left. The default closes the activity, which ends the process and the music; a music
  // player goes to the background instead, like the home button.
  @Deprecated("Called by wry's back handler when the web view has no history left")
  override fun onBackPressed() {
    moveTaskToBack(true)
  }
}
