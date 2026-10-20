//! Downloaded music lives in Application Support, which iOS backs up by default.
//! Apple asks apps to keep anything that can be downloaded again out of iCloud
//! and computer backups, so every launch marks the media folder "do not back
//! up"; the flag covers everything inside it.

use objc2::runtime::AnyObject;
use objc2_foundation::{NSNumber, NSString, NSURLIsExcludedFromBackupKey, NSURL};
use tauri::AppHandle;

pub(crate) fn exclude_media_dir(app: &AppHandle) {
    let dir = match psysonic_syncfs::cache::local::resolve_media_dir(None, app) {
        Ok(dir) => dir,
        Err(e) => {
            crate::app_eprintln!("[offline] media folder unknown, backup flag not set: {e}");
            return;
        }
    };
    if let Err(e) = std::fs::create_dir_all(&dir) {
        crate::app_eprintln!("[offline] could not create {}: {e}", dir.display());
        return;
    }
    let url = NSURL::fileURLWithPath_isDirectory(&NSString::from_str(&dir.to_string_lossy()), true);
    let excluded = NSNumber::new_bool(true);
    let value: &AnyObject = &excluded;
    // SAFETY: the key is a framework constant, and the value for it is an NSNumber
    // holding a BOOL, as the key requires.
    let result =
        unsafe { url.setResourceValue_forKey_error(Some(value), NSURLIsExcludedFromBackupKey) };
    if let Err(e) = result {
        crate::app_eprintln!("[offline] backup flag on {} not set: {e:?}", dir.display());
    }
}
