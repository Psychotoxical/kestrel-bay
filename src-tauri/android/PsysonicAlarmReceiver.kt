// ⚠️ Android territory. Copied into the generated project by `patch-gen.mjs`, which declares
// it in the manifest.
//
// The system alarm going off, the alarm notification's Snooze and Stop buttons, and the
// phone starting up again or the app being updated (alarms survive neither).
package dev.psysonic.player

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class PsysonicAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val ctx = context.applicationContext
    when (intent.action) {
      PsysonicAlarm.ACTION_FIRE ->
        intent.getStringExtra(PsysonicAlarm.EXTRA_ID)?.let { PsysonicAlarm.fire(ctx, it) }
      PsysonicAlarm.ACTION_SNOOZE -> PsysonicAlarm.dismiss(ctx, snooze = true)
      PsysonicAlarm.ACTION_STOP -> PsysonicAlarm.dismiss(ctx, snooze = false)
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      Intent.ACTION_TIME_CHANGED,
      Intent.ACTION_TIMEZONE_CHANGED -> PsysonicAlarm.schedule(ctx)
    }
  }
}
