// ⚠️ Android territory. Copied over Tauri's generated MainActivity by `patch-gen.mjs`
// (the generated project under `src-tauri/gen/android` is not in git).
package dev.psysonic.player

import android.graphics.Color
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Psysonic's default themes are dark; the web view corrects this once a theme loads.
    applySystemBars(dark = true)
    super.onCreate(savedInstanceState)
    // Last in the back chain: wry's callback (added later, so asked first) steps the web view
    // back through its history and hands on once there is nothing left. Closing the activity
    // would end the process and the music; a music player goes to the background instead.
    // A callback, not an onBackPressed() override: some makers (Honor, Android 14) send the
    // back key straight to onBackPressed(), which would skip wry and leave the app at once.
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        moveTaskToBack(true)
      }
    })
  }

  // Lock screen, notification and headset buttons (see PsysonicMedia), and the theme's
  // brightness for the system bars (see androidSystemBars.ts).
  override fun onWebViewCreate(webView: WebView) {
    PsysonicMedia.attach(this, webView)
    webView.addJavascriptInterface(ShellBridge(this), "PsysonicAndroidShell")
    watchMeteredNetwork(webView)
  }

  /**
   * Mobile data or a hotspot: downloads and the hot cache wait for Wi-Fi, as on iOS
   * (androidNetwork.ts). Android reports every change of the default network.
   */
  private fun watchMeteredNetwork(webView: WebView) {
    val cm = getSystemService(ConnectivityManager::class.java) ?: return
    cm.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
      override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
        val metered = !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
        webView.post {
          webView.evaluateJavascript(
            "window.__psyAndroidMetered && window.__psyAndroidMetered($metered)",
            null,
          )
        }
      }
    })
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

    @JavascriptInterface
    fun isMetered(): Boolean =
      activity.getSystemService(ConnectivityManager::class.java)?.isActiveNetworkMetered ?: false
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

}
