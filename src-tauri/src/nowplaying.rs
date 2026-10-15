#[cfg_attr(not(target_os = "ios"), allow(dead_code))]
pub struct Track {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: f64,
}

pub use imp::{clear, register_remote, set_cover, set_playback, set_track};

#[cfg(target_os = "ios")]
mod imp {
    use std::cell::RefCell;
    use std::ptr::NonNull;

    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2::{AnyThread, MainThreadMarker, msg_send};
    use objc2_core_foundation::CGSize;
    use objc2_foundation::{NSData, NSDictionary, NSNumber, NSString};
    use objc2_media_player::{
        MPMediaItemArtwork, MPMediaItemPropertyAlbumTitle, MPMediaItemPropertyArtist,
        MPMediaItemPropertyArtwork, MPMediaItemPropertyPlaybackDuration, MPMediaItemPropertyTitle,
        MPNowPlayingInfoCenter, MPNowPlayingInfoPropertyElapsedPlaybackTime,
        MPNowPlayingInfoPropertyPlaybackRate, MPRemoteCommand, MPRemoteCommandCenter,
        MPRemoteCommandEvent, MPRemoteCommandHandlerStatus,
    };
    use objc2_ui_kit::{UIApplication, UIImage};

    use super::Track;

    struct State {
        id: u32,
        track: Track,
        artwork: Option<Retained<MPMediaItemArtwork>>,
        elapsed: f64,
        rate: f64,
    }

    thread_local! {
        static STATE: RefCell<Option<State>> = const { RefCell::new(None) };
    }

    pub fn set_track(id: u32, track: Track) {
        STATE.with_borrow_mut(|state| {
            *state = Some(State {
                id,
                track,
                artwork: None,
                elapsed: 0.0,
                rate: 1.0,
            });
            publish(state.as_ref());
        });
    }

    pub fn set_cover(id: u32, bytes: Vec<u8>) {
        STATE.with_borrow_mut(|state| {
            if let Some(current) = state.as_mut().filter(|s| s.id == id) {
                current.artwork = artwork(&bytes);
                publish(state.as_ref());
            }
        });
    }

    pub fn set_playback(playing: bool, elapsed: f64) {
        STATE.with_borrow_mut(|state| {
            if let Some(current) = state.as_mut() {
                current.elapsed = elapsed;
                current.rate = if playing { 1.0 } else { 0.0 };
                publish(state.as_ref());
            }
        });
    }

    pub fn clear() {
        STATE.with_borrow_mut(|state| {
            *state = None;
            publish(None);
        });
    }

    fn publish(state: Option<&State>) {
        let center = unsafe { MPNowPlayingInfoCenter::defaultCenter() };
        let Some(state) = state else {
            unsafe { center.setNowPlayingInfo(None) };
            return;
        };

        let title = NSString::from_str(&state.track.title);
        let artist = NSString::from_str(&state.track.artist);
        let album = NSString::from_str(&state.track.album);
        let duration = NSNumber::numberWithDouble(state.track.duration);
        let elapsed = NSNumber::numberWithDouble(state.elapsed);
        let rate = NSNumber::numberWithDouble(state.rate);

        let mut keys: Vec<&NSString> = Vec::new();
        let mut values: Vec<&AnyObject> = Vec::new();
        unsafe {
            keys.push(MPMediaItemPropertyTitle);
            values.push(&title);
            keys.push(MPMediaItemPropertyArtist);
            values.push(&artist);
            keys.push(MPMediaItemPropertyAlbumTitle);
            values.push(&album);
            keys.push(MPMediaItemPropertyPlaybackDuration);
            values.push(&duration);
            keys.push(MPNowPlayingInfoPropertyElapsedPlaybackTime);
            values.push(&elapsed);
            keys.push(MPNowPlayingInfoPropertyPlaybackRate);
            values.push(&rate);
            if let Some(artwork) = &state.artwork {
                keys.push(MPMediaItemPropertyArtwork);
                values.push(artwork);
            }
        }

        let info = NSDictionary::from_slices(&keys, &values);
        unsafe { center.setNowPlayingInfo(Some(&info)) };
    }

    fn artwork(bytes: &[u8]) -> Option<Retained<MPMediaItemArtwork>> {
        let data = NSData::with_bytes(bytes);
        let image = UIImage::imageWithData(&data)?;
        let size = unsafe { image.size() };
        let handler =
            RcBlock::new(move |_size: CGSize| -> NonNull<UIImage> { NonNull::from(&*image) });
        let artwork: Retained<MPMediaItemArtwork> = unsafe {
            msg_send![
                MPMediaItemArtwork::alloc(),
                initWithBoundsSize: size,
                requestHandler: &*handler
            ]
        };
        Some(artwork)
    }

    pub fn register_remote(on_command: impl Fn(&'static str) + Clone + 'static) {
        let bind = |command: Retained<MPRemoteCommand>, name: &'static str| {
            let callback = on_command.clone();
            let handler = RcBlock::new(move |_event: NonNull<MPRemoteCommandEvent>| {
                callback(name);
                MPRemoteCommandHandlerStatus::Success
            });
            unsafe {
                command.setEnabled(true);
                let _ = command.addTargetWithHandler(&handler);
            }
        };

        let center = unsafe { MPRemoteCommandCenter::sharedCommandCenter() };
        unsafe {
            bind(center.playCommand(), "play");
            bind(center.pauseCommand(), "pause");
            bind(center.togglePlayPauseCommand(), "toggle");
            bind(center.nextTrackCommand(), "next");
            bind(center.previousTrackCommand(), "previous");
        }

        if let Some(mtm) = MainThreadMarker::new() {
            UIApplication::sharedApplication(mtm).beginReceivingRemoteControlEvents();
        }
    }
}

#[cfg(not(target_os = "ios"))]
mod imp {
    use super::Track;

    pub fn set_track(_id: u32, _track: Track) {}

    pub fn set_cover(_id: u32, _bytes: Vec<u8>) {}

    pub fn set_playback(_playing: bool, _elapsed: f64) {}

    pub fn clear() {}

    pub fn register_remote(_on_command: impl Fn(&'static str) + Clone + 'static) {}
}
