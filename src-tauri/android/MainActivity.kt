// ⚠️ Android territory. Copied over Tauri's generated MainActivity by `patch-gen.mjs`
// (the generated project under `src-tauri/gen/android` is not in git).
package dev.psysonic.player

import android.content.Intent
import android.content.pm.ActivityInfo
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
    allowLandscape(false)
    PsysonicAlarm.onActivityIntent(this, intent)
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

  /** A ringing alarm opens the running activity again (PsysonicAlarm). */
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    PsysonicAlarm.onActivityIntent(this, intent)
  }

  // Lock screen, notification and headset buttons (see PsysonicMedia), the theme's
  // brightness for the system bars (see androidSystemBars.ts), copies of picked files
  // (see PsysonicFiles) and the music alarm (see PsysonicAlarm).
  override fun onWebViewCreate(webView: WebView) {
    shellWebView = webView
    PsysonicMedia.attach(this, webView)
    PsysonicAlarm.attach(this, webView)
    webView.addJavascriptInterface(ShellBridge(this), "PsysonicAndroidShell")
    webView.addJavascriptInterface(PsysonicFiles(applicationContext, webView), "PsysonicAndroidFiles")
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

    /** See `allowLandscape` and `mobileShell/utils/landscape.ts`. */
    @JavascriptInterface
    fun allowLandscape(allowed: Boolean) {
      activity.runOnUiThread { activity.allowLandscape(allowed) }
    }

    /** See `closeOverlayOnBack` and `mobileShell/android/androidBack.ts`. */
    @JavascriptInterface
    fun setOverlayOpen(open: Boolean) {
      activity.runOnUiThread { activity.setOverlayOpen(open) }
    }

    @JavascriptInterface
    fun isMetered(): Boolean =
      activity.getSystemService(ConnectivityManager::class.java)?.isActiveNetworkMetered ?: false
  }

  private var shellWebView: WebView? = null

  /**
   * A sheet, menu or search is open: the back key closes it (androidBack.ts sends it an
   * Escape) instead of wry going back a page underneath it.
   */
  private val closeOverlayOnBack = object : OnBackPressedCallback(true) {
    override fun handleOnBackPressed() {
      shellWebView?.evaluateJavascript("window.__psyAndroidBack && window.__psyAndroidBack()", null)
    }
  }

  fun setOverlayOpen(open: Boolean) {
    // Added anew each time: the dispatcher asks the newest callback first, so this one
    // stays ahead of wry's.
    closeOverlayOnBack.remove()
    if (open) onBackPressedDispatcher.addCallback(this, closeOverlayOnBack)
  }

  /**
   * Phones stay upright except in the full-screen player, as on the iPhone; tablets turn
   * freely, as the iPad does. Landscape follows the sensor unless the user locked rotation.
   */
  fun allowLandscape(allowed: Boolean) {
    if (resources.configuration.smallestScreenWidthDp >= 600) return
    requestedOrientation = if (allowed) {
      ActivityInfo.SCREEN_ORIENTATION_USER
    } else {
      ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
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

}
