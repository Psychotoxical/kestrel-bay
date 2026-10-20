import { describe, expect, it } from 'vitest';
import { autoSearchToSiri } from './androidAuto';

describe('autoSearchToSiri', () => {
  it('passes free text on as an unspecific request', () => {
    expect(autoSearchToSiri({ query: 'Waiting On Love', focus: '' })).toEqual({
      mediaName: 'Waiting On Love',
      artistName: null,
      albumName: null,
      mediaType: 0,
    });
  });

  it('names the song and keeps its artist when the assistant found a song', () => {
    expect(autoSearchToSiri({
      query: 'waiting on love by fm',
      focus: 'vnd.android.cursor.item/audio',
      title: 'Waiting On Love',
      artist: 'FM',
    })).toEqual({ mediaName: 'Waiting On Love', artistName: 'FM', albumName: null, mediaType: 1 });
  });

  it('names the album, the artist or the playlist by focus', () => {
    expect(autoSearchToSiri({ query: 'thirteen', focus: 'vnd.android.cursor.item/album', album: 'Thirteen', artist: 'FM' }))
      .toMatchObject({ mediaName: 'Thirteen', mediaType: 2 });
    expect(autoSearchToSiri({ query: 'fm', focus: 'vnd.android.cursor.item/artist', artist: 'FM' }))
      .toMatchObject({ mediaName: 'FM', mediaType: 3 });
    expect(autoSearchToSiri({ query: 'road trip', focus: 'vnd.android.cursor.item/playlist', playlist: 'Road Trip' }))
      .toMatchObject({ mediaName: 'Road Trip', mediaType: 5 });
  });

  it('falls back to the spoken text when the focused field is missing', () => {
    expect(autoSearchToSiri({ query: 'thirteen', focus: 'vnd.android.cursor.item/album' }))
      .toMatchObject({ mediaName: 'thirteen', mediaType: 2 });
  });
});
