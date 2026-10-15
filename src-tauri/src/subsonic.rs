use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::Value;

use crate::player::{client, request_error};

const API_VERSION: &str = "1.16.1";
const CLIENT: &str = "kestrelbay";

#[derive(Serialize)]
pub struct Token {
    pub salt: String,
    pub token: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Song {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: u64,
    pub suffix: String,
    pub bit_rate: u64,
    pub cover_art: String,
}

pub fn make_token(password: &str) -> Token {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let salt: String = format!("{:x}", md5::compute(nanos.to_le_bytes()))
        .chars()
        .take(12)
        .collect();
    let token = format!("{:x}", md5::compute(format!("{password}{salt}")));
    Token { salt, token }
}

pub fn random_songs(
    server: &str,
    user: &str,
    salt: &str,
    token: &str,
    size: u32,
) -> Result<Vec<Song>, String> {
    let url = format!("{}/rest/getRandomSongs.view", server.trim_end_matches('/'));
    let size = size.to_string();
    let response = client()
        .get(url)
        .query(&[
            ("u", user),
            ("t", token),
            ("s", salt),
            ("v", API_VERSION),
            ("c", CLIENT),
            ("f", "json"),
            ("size", size.as_str()),
        ])
        .send()
        .and_then(|r| r.error_for_status())
        .map_err(request_error)?;
    let text = response.text().map_err(request_error)?;
    let body: Value = serde_json::from_str(&text).map_err(|e| format!("invalid response: {e}"))?;
    let root = &body["subsonic-response"];
    if root["status"] != "ok" {
        let message = root["error"]["message"]
            .as_str()
            .unwrap_or("request failed");
        return Err(message.to_string());
    }

    let text_of = |v: &Value| v.as_str().unwrap_or_default().to_string();
    let songs = root["randomSongs"]["song"]
        .as_array()
        .map(|list| {
            list.iter()
                .map(|s| Song {
                    id: text_of(&s["id"]),
                    title: text_of(&s["title"]),
                    artist: text_of(&s["artist"]),
                    album: text_of(&s["album"]),
                    duration: s["duration"].as_u64().unwrap_or(0),
                    suffix: text_of(&s["suffix"]),
                    bit_rate: s["bitRate"].as_u64().unwrap_or(0),
                    cover_art: text_of(&s["coverArt"]),
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(songs)
}
