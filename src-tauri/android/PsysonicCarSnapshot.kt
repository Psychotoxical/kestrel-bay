// ⚠️ Android territory. Copied into the generated project by `patch-gen.mjs`.
//
// The copy of the car's lists the web view leaves for a car start with Psysonic closed
// (`mobileShell/android/androidAutoSnapshot.ts` explains why and what is in it): the lists by
// node, the tracks they play, and the queue to resume. Two files in the app's own storage; the
// stream addresses in them carry the server login, as the web view's own storage does.
package dev.psysonic.player

import android.content.Context
import java.io.File
import java.util.concurrent.Executors
import org.json.JSONArray
import org.json.JSONObject

object PsysonicCarSnapshot {
  private const val SNAPSHOT_FILE = "car-snapshot.json"
  private const val RESUME_FILE = "car-resume.json"

  /** Writes leave the web view's JavaScript thread at once; a few MB take a moment. */
  private val writer = Executors.newSingleThreadExecutor()

  @Volatile private var cached: JSONObject? = null

  fun saveSnapshot(ctx: Context, json: String) {
    cached = null
    write(ctx, SNAPSHOT_FILE, json)
  }

  fun saveResume(ctx: Context, json: String) = write(ctx, RESUME_FILE, json)

  private fun write(ctx: Context, name: String, json: String) {
    val dir = ctx.applicationContext.filesDir
    writer.execute {
      runCatching {
        val tmp = File(dir, "$name.tmp")
        tmp.writeText(json)
        if (!tmp.renameTo(File(dir, name))) tmp.delete()
      }.onFailure { android.util.Log.w("PsysonicAuto", "car copy: $name not written: $it") }
    }
  }

  private fun read(ctx: Context, name: String): JSONObject? = runCatching {
    val file = File(ctx.applicationContext.filesDir, name)
    if (file.exists()) JSONObject(file.readText()) else null
  }.getOrNull()

  private fun snapshot(ctx: Context): JSONObject? =
    cached ?: read(ctx, SNAPSHOT_FILE)?.also { cached = it }

  fun exists(ctx: Context): Boolean = snapshot(ctx) != null

  /** A list as the web view sent it (`carListJson`), for `PsysonicMedia.carItems`. */
  fun list(ctx: Context, node: String): String? =
    snapshot(ctx)?.optJSONObject("lists")?.optJSONObject(node)?.toString()

  /** The tracks behind a list node, `random`, `favorites` or `offline|<n>`. */
  fun plays(ctx: Context, key: String): JSONArray? =
    snapshot(ctx)?.optJSONObject("plays")?.optJSONArray(key)?.takeIf { it.length() > 0 }

  fun station(ctx: Context, index: String): JSONObject? =
    snapshot(ctx)?.optJSONObject("stations")?.optJSONObject(index)

  /** Every list, to look a spoken name up in. */
  fun lists(ctx: Context): JSONObject? = snapshot(ctx)?.optJSONObject("lists")

  fun resume(ctx: Context): JSONObject? = read(ctx, RESUME_FILE)

  /** The cover an album row of the copy shows, by album id, or null. */
  fun albumCover(ctx: Context, albumId: String): String? {
    if (albumId.isEmpty()) return null
    val lists = lists(ctx) ?: return null
    for (key in lists.keys()) {
      val sections = lists.getJSONObject(key).optJSONArray("sections") ?: continue
      for (s in 0 until sections.length()) {
        val rows = sections.getJSONObject(s).optJSONArray("items") ?: continue
        for (r in 0 until rows.length()) {
          val row = rows.getJSONObject(r)
          val node = row.optString("node")
          if (node.startsWith("album|") && android.net.Uri.decode(node.substringAfterLast('|')) == albumId) {
            row.optString("image").takeIf { it.isNotEmpty() }?.let { return it }
          }
        }
      }
    }
    return null
  }
}
