import React from 'react';
import { useTranslation } from 'react-i18next';
import type { SubsonicSong } from '@/lib/api/subsonicTypes';
import { copyTextToClipboard } from '@/lib/server/serverMagicString';
import { showToast } from '@/lib/dom/toast';
import { formatTrackTime } from '@/lib/format/formatDuration';
import { formatLastSeen } from '@/lib/format/userMgmtHelpers';
import { genreTagsFor } from '@/lib/library/genreTags';
import { moodsLabel } from '@/lib/format/playlistDetailHelpers';
import {
  formatQueueMoodLabels,
  resolveQueueBpm,
  type ParsedTrackEnrichment,
} from '@/lib/library/trackEnrichment';
import i18n from '@/lib/i18n';

function formatSize(bytes?: number): string | null {
  if (!bytes) return null;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(2)} MB`;
  return `${(bytes / 1_000).toFixed(0)} KB`;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '' || value === '—') return null;
  return (
    <tr>
      <td className="song-info-label">{label}</td>
      <td className="song-info-value">{value}</td>
    </tr>
  );
}

/** Title / Artist / Album: copies the plain text (double-click on desktop, a tap on touch). */
function CopyableFieldRow({
  label, text, gesture,
}: { label: string; text: string | null | undefined; gesture: 'dblclick' | 'click' }) {
  const { t } = useTranslation();
  if (!text || text === '—') return null;
  const copy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = await copyTextToClipboard(text);
    if (ok) showToast(t('orbit.tooltipCopied'), 2000, 'info');
    else showToast(t('contextMenu.shareCopyFailed'), 3500, 'error');
  };
  return (
    <tr>
      <td className="song-info-label">{label}</td>
      <td
        className="song-info-value song-info-value--no-select"
        onDoubleClick={gesture === 'dblclick' ? copy : undefined}
        onClick={gesture === 'click' ? copy : undefined}
      >
        {text}
      </td>
    </tr>
  );
}

function Divider() {
  return <tr><td colSpan={2} className="song-info-divider" /></tr>;
}

interface SongInfoRowsProps {
  song: SubsonicSong;
  enrichment: ParsedTrackEnrichment | null;
  absolutePath: string | null;
  /** How Title / Artist / Album are copied. */
  copyGesture: 'dblclick' | 'click';
}

/** The table rows of the Song Info dialog, shared by the desktop modal and the touch sheet. */
export default function SongInfoRows({ song, enrichment, absolutePath, copyGesture }: SongInfoRowsProps) {
  const { t } = useTranslation();

  const channels = song.channelCount === 1
    ? t('songInfo.mono')
    : song.channelCount === 2
      ? t('songInfo.stereo')
      : song.channelCount
        ? `${song.channelCount} ch`
        : null;

  const trackLabel = song.discNumber && song.discNumber > 1
    ? `${song.discNumber} – ${song.track}`
    : song.track != null
      ? String(song.track)
      : null;

  const hasReplayGain = song.replayGain &&
    (song.replayGain.trackGain !== undefined || song.replayGain.albumGain !== undefined);

  const displayBpm = resolveQueueBpm(
    enrichment ?? {
      serverBpm: song.bpm != null && song.bpm > 0 ? song.bpm : null,
      measuredBpm: null,
      moodLabels: [],
    },
  );
  // The file's own MOOD/TMOO tags win over the ones the analysis derives: they
  // are what the tagger wrote, while the analysis labels come from a fixed
  // vocabulary the app translates. Tracks with neither keep the row hidden.
  const fileMoods = moodsLabel(song);
  const displayMood = fileMoods
    || (enrichment ? formatQueueMoodLabels(enrichment.moodLabels, t) : null);

  // `genre` carries one name even where the file has several — servers put the
  // full set in OpenSubsonic's `genres`, which is what the album chips and genre
  // browse already read. Same separator as the mood row above.
  const genreTags = genreTagsFor(song);

  return (
    <>
      <CopyableFieldRow label={t('songInfo.songTitle')} text={song.title} gesture={copyGesture} />
      <CopyableFieldRow label={t('songInfo.artist')} text={song.artist} gesture={copyGesture} />
      <CopyableFieldRow label={t('songInfo.album')} text={song.album} gesture={copyGesture} />
      {song.albumArtist && song.albumArtist !== song.artist && (
        <Row label={t('songInfo.albumArtist')} value={song.albumArtist} />
      )}
      <Row label={t('songInfo.year')} value={song.year} />
      <Row
        label={t(genreTags.length > 1 ? 'songInfo.genres' : 'songInfo.genre')}
        value={genreTags.join(' · ') || null}
      />
      <Row label={t('songInfo.duration')} value={formatTrackTime(song.duration)} />
      <Row label={t('songInfo.track')} value={trackLabel} />
      <Row label={t('songInfo.bpm')} value={displayBpm} />
      <Row label={t('songInfo.mood')} value={displayMood} />
      <Row label={t('songInfo.playCount')} value={song.playCount} />
      <Row label={t('songInfo.lastPlayed')} value={song.played ? formatLastSeen(song.played, i18n.language, '—') : null} />

      <Divider />

      <Row label={t('songInfo.format')} value={[song.suffix?.toUpperCase(), song.contentType].filter(Boolean).join(' · ') || null} />
      <Row label={t('songInfo.bitrate')} value={song.bitRate ? `${song.bitRate} kbps` : null} />
      <Row label={t('songInfo.sampleRate')} value={song.samplingRate ? `${(song.samplingRate / 1000).toFixed(1)} kHz` : null} />
      <Row label={t('songInfo.bitDepth')} value={song.bitDepth ? `${song.bitDepth} bit` : null} />
      <Row label={t('songInfo.channels')} value={channels} />
      <Row label={t('songInfo.fileSize')} value={formatSize(song.size)} />

      {(absolutePath || song.path) && (
        <>
          <Divider />
          <Row label={t('songInfo.path')} value={<span className="song-info-path">{absolutePath ?? song.path}</span>} />
        </>
      )}

      {hasReplayGain && (
        <>
          <Divider />
          {song.replayGain!.trackGain !== undefined && (
            <Row label={t('songInfo.replayGainTrack')} value={`${song.replayGain!.trackGain >= 0 ? '+' : ''}${song.replayGain!.trackGain.toFixed(2)} dB`} />
          )}
          {song.replayGain!.albumGain !== undefined && (
            <Row label={t('songInfo.replayGainAlbum')} value={`${song.replayGain!.albumGain >= 0 ? '+' : ''}${song.replayGain!.albumGain.toFixed(2)} dB`} />
          )}
          {song.replayGain!.trackPeak !== undefined && (
            <Row label={t('songInfo.replayGainPeak')} value={song.replayGain!.trackPeak.toFixed(6)} />
          )}
        </>
      )}
    </>
  );
}
