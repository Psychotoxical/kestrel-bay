//! ⚠️ Android territory. Everything in this folder is compiled for the Android app only
//! (`target_os = "android"`); iOS and the desktop never see it. Shared mobile code
//! lives outside this folder, iOS's counterpart is `../ios/`. See `MOBILE.md`.

pub mod context;
