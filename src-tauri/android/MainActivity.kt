// ⚠️ Android territory. Copied over Tauri's generated MainActivity by `patch-gen.mjs`
// (the generated project under `src-tauri/gen/android` is not in git).
package dev.psysonic.player

import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  // Wry steps the web view back through its history and calls this once there is nothing
  // left. The default closes the activity, which ends the process and the music; a music
  // player goes to the background instead, like the home button.
  @Deprecated("Called by wry's back handler when the web view has no history left")
  override fun onBackPressed() {
    moveTaskToBack(true)
  }
}
