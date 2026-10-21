// ⚠️ Android territory. Copied into the generated project by `patch-gen.mjs`.
//
// Files the user picks or saves through Android's document picker come as `content://`
// addresses, which neither Rust nor the web view can open as files. Backups can be large,
// so they are not passed through the web view as bytes (that ran the app out of memory):
// this copies between such an address and a file in the app's own folders, streamed on a
// background thread. The web view asks through `PsysonicAndroidFiles` and hears back on
// `window.__psyFileCopied(id, error, path)` (`lib/util/exportFile.ts`).
package dev.psysonic.player

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.OpenableColumns
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject
import java.io.File
import kotlin.concurrent.thread

class PsysonicFiles(private val context: Context, private val view: WebView) {
  private val main = Handler(Looper.getMainLooper())

  /**
   * Picked document → a file in `dir` named after the document (import). The name comes
   * from the provider: addresses like `…/document/19` carry none, and the import tells
   * backup kinds apart by their extension. Android names a second save of a file
   * `a.psyfull (1)`; the counter moves in front of the extension.
   */
  @JavascriptInterface
  fun copyIn(id: Int, uri: String, dir: String) = copy(id) {
    val source = Uri.parse(uri)
    val name = (displayName(source)?.replace('/', '_') ?: "import")
      .replace(Regex("""^(.*)(\.[A-Za-z0-9]+) \((\d+)\)$"""), "$1 ($3)$2")
    // Earlier copies are done with (an import reloads the app); a full backup is large.
    File(dir).listFiles { file -> file.name.startsWith("picked-") }?.forEach { it.delete() }
    val target = File(dir, "picked-${System.currentTimeMillis()}-$name")
    val input = context.contentResolver.openInputStream(source) ?: error("cannot open $uri")
    input.use { src -> target.outputStream().use { dst -> src.copyTo(dst) } }
    target.path
  }

  private fun displayName(uri: Uri): String? =
    context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { row ->
      if (row.moveToFirst()) row.getString(0) else null
    }

  /** File → document the picker created (export). */
  @JavascriptInterface
  fun copyOut(id: Int, path: String, uri: String) = copy(id) {
    // "wt": replace whatever the document held.
    val output = context.contentResolver.openOutputStream(Uri.parse(uri), "wt") ?: error("cannot open $uri")
    output.use { dst -> File(path).inputStream().use { src -> src.copyTo(dst) } }
    uri
  }

  private fun copy(id: Int, work: () -> String) {
    thread(name = "psysonic-file-copy") {
      val result = runCatching(work)
      val error = result.exceptionOrNull()?.let { JSONObject.quote(it.message ?: it.toString()) } ?: "null"
      val path = result.getOrNull()?.let(JSONObject::quote) ?: "null"
      main.post {
        view.evaluateJavascript("window.__psyFileCopied && window.__psyFileCopied($id, $error, $path)", null)
      }
    }
  }
}
