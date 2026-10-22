// ⚠️ Android territory. Copied into the generated project by `patch-gen.mjs`, which also
// declares the receiver (PsysonicAlarmReceiver), the service (PsysonicAlarmService) and the
// alarm permissions.
//
// The music alarm (Android only, Frank 21.10.). The web view owns the alarms
// (`mobileShell/alarm`) and hands the whole list over whenever it changes; this side keeps a
// copy, sets the soonest one in the system with `setAlarmClock` (exact, wakes the phone from
// Doze, shown in the status bar) and sets it again after a reboot. When it rings, the
// phone shows the alarm over the lock screen, the web view starts the music, the volume
// rises to the alarm's cap, and a ringtone stands in when no music plays within 25 s.
package dev.psysonic.player

import android.Manifest
import android.app.Activity
import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.lang.ref.WeakReference
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZonedDateTime

object PsysonicAlarm {
  const val ACTION_FIRE = "dev.psysonic.player.ALARM_FIRE"
  const val ACTION_SNOOZE = "dev.psysonic.player.ALARM_SNOOZE"
  const val ACTION_STOP = "dev.psysonic.player.ALARM_STOP"
  const val EXTRA_ID = "alarmId"
  /** On the activity intent: open over the lock screen for a ringing alarm. */
  const val EXTRA_RINGING = "alarmRinging"

  private const val PREFS = "psysonic_alarm"
  private const val KEY_ALARMS = "alarms"
  private const val KEY_SNOOZE_ID = "snoozeId"
  private const val KEY_SNOOZE_AT = "snoozeAt"
  private const val KEY_DISABLED = "disabled"
  /** Music that has not started by then gives way to the ringtone. */
  private const val FALLBACK_MS = 25_000L
  private const val FADE_STEP_MS = 250L
  /** An alarm nobody stops goes quiet after this long, as the clock app does. */
  private const val DEFAULT_SILENCE_MIN = 10

  private val main = Handler(Looper.getMainLooper())
  private var webView: WebView? = null
  private var activity: WeakReference<Activity>? = null

  /** The alarm that rings now, as the web view gets it; null while none rings. */
  private var ringing: JSONObject? = null
  /** The web view asked for alarms and can start music. */
  private var webListening = false
  private var musicStarted = false
  private var ringtone: Ringtone? = null
  private var savedMusicVolume = -1
  private var wakeLock: PowerManager.WakeLock? = null

  // ── Scheduling

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun alarms(ctx: Context): List<JSONObject> {
    val raw = prefs(ctx).getString(KEY_ALARMS, null) ?: return emptyList()
    return runCatching {
      val list = JSONArray(raw)
      (0 until list.length()).map(list::getJSONObject)
    }.getOrDefault(emptyList())
  }

  /** The next time `alarm` rings after `now`; repeating alarms on their weekdays (ISO, Monday = 1). */
  fun nextTrigger(alarm: JSONObject, now: ZonedDateTime): ZonedDateTime? {
    if (!alarm.optBoolean("enabled")) return null
    val time = LocalTime.of(alarm.optInt("hour"), alarm.optInt("minute"))
    val days = alarm.optJSONArray("days")?.let { d -> (0 until d.length()).map(d::getInt).toSet() }.orEmpty()
    for (offset in 0..7L) {
      val date: LocalDate = now.toLocalDate().plusDays(offset)
      val at = ZonedDateTime.of(date, time, now.zone)
      if (!at.isAfter(now)) continue
      if (days.isEmpty() || date.dayOfWeek.value in days) return at
    }
    return null
  }

  private fun firePendingIntent(ctx: Context, id: String?): PendingIntent {
    val intent = Intent(ctx, PsysonicAlarmReceiver::class.java).setAction(ACTION_FIRE)
    if (id != null) intent.putExtra(EXTRA_ID, id)
    return PendingIntent.getBroadcast(
      ctx, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
  }

  /** Opens the alarm page; Android shows it for the alarm icon in the status bar. */
  private fun showPendingIntent(ctx: Context): PendingIntent = PendingIntent.getActivity(
    ctx, 1,
    Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
  )

  /** Sets the soonest alarm (or snooze) in the system; one at a time, the next is set when it rings. */
  fun schedule(ctx: Context) {
    val am = ctx.getSystemService(AlarmManager::class.java) ?: return
    val now = ZonedDateTime.now()
    var soonest: Pair<String, ZonedDateTime>? = null
    for (alarm in alarms(ctx)) {
      val at = nextTrigger(alarm, now) ?: continue
      if (soonest == null || at.isBefore(soonest.second)) soonest = alarm.optString("id") to at
    }
    val p = prefs(ctx)
    val snoozeAt = p.getLong(KEY_SNOOZE_AT, 0L)
    if (snoozeAt > System.currentTimeMillis()) {
      val at = ZonedDateTime.ofInstant(java.time.Instant.ofEpochMilli(snoozeAt), now.zone)
      if (soonest == null || at.isBefore(soonest.second)) {
        soonest = (p.getString(KEY_SNOOZE_ID, null) ?: "") to at
      }
    }
    if (soonest == null) {
      am.cancel(firePendingIntent(ctx, null))
      return
    }
    if (!canScheduleExact(ctx)) return
    am.setAlarmClock(
      AlarmManager.AlarmClockInfo(soonest.second.toInstant().toEpochMilli(), showPendingIntent(ctx)),
      firePendingIntent(ctx, soonest.first),
    )
  }

  private fun canScheduleExact(ctx: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
      ctx.getSystemService(AlarmManager::class.java)?.canScheduleExactAlarms() == true

  // ── Ringing

  /** The system alarm went off (PsysonicAlarmReceiver). */
  fun fire(ctx: Context, id: String) {
    val p = prefs(ctx)
    val alarm = alarms(ctx).firstOrNull { it.optString("id") == id }
    if (p.getString(KEY_SNOOZE_ID, null) == id) {
      p.edit().remove(KEY_SNOOZE_ID).remove(KEY_SNOOZE_AT).apply()
    }
    if (alarm == null) {
      schedule(ctx)
      return
    }
    // A one-time alarm turns itself off, as in the clock app; the web view learns it later.
    if ((alarm.optJSONArray("days")?.length() ?: 0) == 0) {
      disable(ctx, id)
    }
    schedule(ctx)
    ring(ctx, alarm)
  }

  private fun disable(ctx: Context, id: String) {
    val list = JSONArray()
    for (a in alarms(ctx)) {
      if (a.optString("id") == id) a.put("enabled", false)
      list.put(a)
    }
    val disabled = JSONArray(prefs(ctx).getString(KEY_DISABLED, "[]")).put(id)
    prefs(ctx).edit().putString(KEY_ALARMS, list.toString()).putString(KEY_DISABLED, disabled.toString()).apply()
  }

  private fun ring(ctx: Context, alarm: JSONObject) {
    android.util.Log.i("PsysonicAlarm", "ring ${alarm.optString("id")} (web listening: $webListening)")
    stopSounds(ctx)
    appContextFallback = ctx.applicationContext
    ringing = alarm
    musicStarted = false
    acquireWakeLock(ctx, silenceMs(alarm))
    PsysonicAlarmService.start(ctx, alarm)
    if (alarm.optBoolean("vibrate", true)) vibrate(ctx)
    startVolumeRamp(ctx, alarm)
    deliverToWeb()
    // Locked, the notification's full-screen intent opens the app over the lock screen. In
    // use, Android only shows a banner, and without the app there is no music, just the
    // ringtone (Asra, 21.10.). A direct start from the background is allowed only to apps
    // that may draw over other apps, so the alarm page asks for that.
    if (Settings.canDrawOverlays(ctx)) {
      runCatching { ctx.startActivity(ringIntent(ctx)) }
    }
    main.postDelayed(fallback, FALLBACK_MS)
    main.removeCallbacks(autoSilence)
    val silenceMs = silenceMs(alarm)
    if (silenceMs > 0) main.postDelayed(autoSilence, silenceMs)
  }

  /** Per alarm since 22.10. (Asra); 0 = rings until stopped. Older alarms keep 10 minutes. */
  private fun silenceMs(alarm: JSONObject): Long =
    alarm.optInt("silenceMin", DEFAULT_SILENCE_MIN).coerceIn(0, 60) * 60_000L

  private val autoSilence = Runnable {
    val ctx = appContextFallback ?: return@Runnable
    android.util.Log.i("PsysonicAlarm", "no one stopped it, silenced")
    dismiss(ctx, snooze = false)
  }

  fun ringIntent(ctx: Context): Intent = Intent(ctx, MainActivity::class.java)
    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    .putExtra(EXTRA_RINGING, true)

  private fun deliverToWeb() {
    val alarm = ringing ?: return
    if (!webListening) return
    val view = webView ?: return
    main.post {
      view.evaluateJavascript("window.__psyAlarmRing && window.__psyAlarmRing(${JSONObject.quote(alarm.toString())})", null)
    }
  }

  private val fallback = Runnable {
    val ctx = webView?.context?.applicationContext ?: appContextFallback ?: return@Runnable
    if (ringing != null && !musicStarted) {
      android.util.Log.w("PsysonicAlarm", "no music after ${FALLBACK_MS / 1000} s, ringtone")
      playRingtone(ctx)
    }
  }
  private var appContextFallback: Context? = null

  private fun playRingtone(ctx: Context) {
    val uri: Uri = RingtoneManager.getActualDefaultRingtoneUri(ctx, RingtoneManager.TYPE_ALARM)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE) ?: return
    val tone = RingtoneManager.getRingtone(ctx, uri) ?: return
    tone.audioAttributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_ALARM)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
    tone.isLooping = true
    tone.play()
    ringtone = tone
  }

  // Music plays on the media volume (the app keeps its own volume at full, see
  // fullAppVolume.ts): the alarm raises the media volume from low to its cap and puts the
  // user's volume back when it is stopped or snoozed.
  private var rampTarget = 0
  private var rampStep = 0f
  private var rampLevel = 0f

  private fun startVolumeRamp(ctx: Context, alarm: JSONObject) {
    val audio = ctx.getSystemService(AudioManager::class.java) ?: return
    val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
    if (savedMusicVolume < 0) savedMusicVolume = audio.getStreamVolume(AudioManager.STREAM_MUSIC)
    rampTarget = (max * alarm.optInt("maxVolume", 70).coerceIn(5, 100) / 100f).toInt().coerceAtLeast(1)
    val fadeMs = alarm.optInt("fadeSecs", 30).coerceAtLeast(0) * 1000L
    main.removeCallbacks(rampTick)
    if (fadeMs == 0L) {
      audio.setStreamVolume(AudioManager.STREAM_MUSIC, rampTarget, 0)
      return
    }
    rampLevel = 1f
    rampStep = (rampTarget - 1).coerceAtLeast(0) / (fadeMs / FADE_STEP_MS).toFloat()
    audio.setStreamVolume(AudioManager.STREAM_MUSIC, 1, 0)
    appContextFallback = ctx.applicationContext
    main.postDelayed(rampTick, FADE_STEP_MS)
  }

  private val rampTick: Runnable = object : Runnable {
    override fun run() {
      val ctx = appContextFallback ?: return
      val audio = ctx.getSystemService(AudioManager::class.java) ?: return
      rampLevel = (rampLevel + rampStep).coerceAtMost(rampTarget.toFloat())
      audio.setStreamVolume(AudioManager.STREAM_MUSIC, rampLevel.toInt(), 0)
      if (rampLevel < rampTarget) main.postDelayed(this, FADE_STEP_MS)
    }
  }

  private fun vibrate(ctx: Context) {
    val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      ctx.getSystemService(VibratorManager::class.java)?.defaultVibrator
    } else {
      @Suppress("DEPRECATION") ctx.getSystemService(Vibrator::class.java)
    } ?: return
    val pattern = longArrayOf(0, 600, 800)
    val attrs = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build()
    @Suppress("DEPRECATION")
    vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0), attrs)
  }

  private fun stopSounds(ctx: Context) {
    main.removeCallbacks(fallback)
    main.removeCallbacks(autoSilence)
    main.removeCallbacks(rampTick)
    ringtone?.stop()
    ringtone = null
    val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      ctx.getSystemService(VibratorManager::class.java)?.defaultVibrator
    } else {
      @Suppress("DEPRECATION") ctx.getSystemService(Vibrator::class.java)
    }
    vibrator?.cancel()
  }

  /** "Snooze" or "Stop", from the ringing screen or the notification. */
  fun dismiss(ctx: Context, snooze: Boolean) {
    val alarm = ringing ?: return
    android.util.Log.i("PsysonicAlarm", if (snooze) "snooze" else "stop")
    stopSounds(ctx)
    ringing = null
    if (savedMusicVolume >= 0) {
      ctx.getSystemService(AudioManager::class.java)
        ?.setStreamVolume(AudioManager.STREAM_MUSIC, savedMusicVolume, 0)
      savedMusicVolume = -1
    }
    PsysonicMedia.command("pause")
    if (snooze) {
      val minutes = alarm.optInt("snoozeMin", 9).coerceIn(1, 60)
      prefs(ctx).edit()
        .putString(KEY_SNOOZE_ID, alarm.optString("id"))
        .putLong(KEY_SNOOZE_AT, System.currentTimeMillis() + minutes * 60_000L)
        .apply()
    } else {
      prefs(ctx).edit().remove(KEY_SNOOZE_ID).remove(KEY_SNOOZE_AT).apply()
    }
    schedule(ctx)
    PsysonicAlarmService.stop(ctx)
    releaseWakeLock()
    main.post {
      webView?.evaluateJavascript("window.__psyAlarmDismissed && window.__psyAlarmDismissed($snooze)", null)
      activity?.get()?.let { a ->
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
          a.setShowWhenLocked(false)
          a.setTurnScreenOn(false)
        }
      }
    }
  }

  private fun acquireWakeLock(ctx: Context, silenceMs: Long) {
    val lock = wakeLock ?: (ctx.getSystemService(Context.POWER_SERVICE) as PowerManager)
      .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "psysonic:alarm")
      .also { it.setReferenceCounted(false); wakeLock = it }
    // Released when stopped or snoozed; otherwise held as long as the alarm may ring.
    // "Never" still gets a ceiling, so a forgotten alarm cannot keep the phone awake for days.
    lock.acquire(if (silenceMs > 0) silenceMs + 60_000L else 4 * 60 * 60_000L)
  }

  private fun releaseWakeLock() {
    wakeLock?.let { if (it.isHeld) it.release() }
  }

  // ── Activity and web view

  fun attach(activity: Activity, view: WebView) {
    webView = view
    appContextFallback = activity.applicationContext
    this.activity = WeakReference(activity)
    view.addJavascriptInterface(Bridge(activity.applicationContext), "PsysonicAndroidAlarm")
  }

  /** The activity was opened for a ringing alarm: show it over the lock screen. */
  fun onActivityIntent(activity: Activity, intent: Intent?) {
    this.activity = WeakReference(activity)
    if (intent?.getBooleanExtra(EXTRA_RINGING, false) != true || ringing == null) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      activity.setShowWhenLocked(true)
      activity.setTurnScreenOn(true)
    }
  }

  private class Bridge(private val ctx: Context) {
    /** The web view's alarms, whole, after every change. */
    @JavascriptInterface
    fun setAlarms(json: String) {
      main.post {
        runCatching { JSONArray(json) }.getOrNull() ?: return@post
        prefs(ctx).edit().putString(KEY_ALARMS, json).apply()
        schedule(ctx)
      }
    }

    /** One-time alarms that rang and turned themselves off since the last ask. */
    @JavascriptInterface
    fun takeDisabled(): String {
      val raw = prefs(ctx).getString(KEY_DISABLED, "[]") ?: "[]"
      prefs(ctx).edit().remove(KEY_DISABLED).apply()
      return raw
    }

    /** The web view listens; an alarm that rang before it was there is handed over now. */
    @JavascriptInterface
    fun ready() {
      main.post {
        webListening = true
        deliverToWeb()
      }
    }

    /** The alarm's music plays: no ringtone. */
    @JavascriptInterface
    fun musicStarted() {
      android.util.Log.i("PsysonicAlarm", "music started")
      main.post {
        musicStarted = true
        main.removeCallbacks(fallback)
      }
    }

    @JavascriptInterface
    fun dismiss(snooze: Boolean) {
      main.post { dismiss(ctx, snooze) }
    }

    /** What the alarm page shows as missing: notifications, full-screen alarms, exact alarms, battery. */
    @JavascriptInterface
    fun status(): String {
      val nm = ctx.getSystemService(NotificationManager::class.java)
      val notifications = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
        ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
      val fullScreen = Build.VERSION.SDK_INT < 34 || nm?.canUseFullScreenIntent() == true
      val battery = ctx.getSystemService(PowerManager::class.java)
        ?.isIgnoringBatteryOptimizations(ctx.packageName) == true
      return JSONObject()
        .put("notifications", notifications)
        .put("fullScreen", fullScreen)
        .put("exact", canScheduleExact(ctx))
        .put("battery", battery)
        .put("overlay", Settings.canDrawOverlays(ctx))
        .toString()
    }

    /** Opens the system page (or the permission prompt) for one missing item of `status`. */
    @JavascriptInterface
    fun fix(what: String) {
      main.post {
        val act = activity?.get() ?: return@post
        val pkg = Uri.parse("package:${ctx.packageName}")
        runCatching {
          when (what) {
            "notifications" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
              act.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 41)
            }
            "fullScreen" -> if (Build.VERSION.SDK_INT >= 34) {
              act.startActivity(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, pkg))
            }
            "exact" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
              act.startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, pkg))
            }
            // The system's own yes/no dialog, not the list of all apps (alarm clocks may ask).
            "battery" -> act.startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, pkg))
            "overlay" -> act.startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, pkg))
          }
        }
      }
    }
  }
}
