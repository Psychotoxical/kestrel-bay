import { useLayoutEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { SubsonicSong } from '@/lib/api/subsonicTypes';
import { usePlayerStore } from '@/features/playback';
import { APP_MAIN_SCROLL_VIEWPORT_ID } from '@/constants/appScroll';
import { useElementClientHeightById } from '@/lib/hooks/useResizeClientHeight';
import { ownedEntityKey } from '@/lib/util/ownedEntityKey';
import MobileSongRow from '@/features/mobileShell/components/MobileSongRow';

const ROW_HEIGHT_PX = 60;

interface Props {
  songs: SubsonicSong[];
  onPlay: (index: number) => void;
  /** Opens the song menu at the "…" button. */
  onMore: (song: SubsonicSong, at: { x: number; y: number }) => void;
}

/**
 * A long touch song list (thousands of rows), virtualised against the page
 * scroller: only the rows on screen exist. Rows as `MobileSongRow`.
 */
export default function MobileVirtualSongList({ songs, onPlay, onMore }: Props) {
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const listWrapRef = useRef<HTMLDivElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const viewportH = useElementClientHeightById(APP_MAIN_SCROLL_VIEWPORT_ID);

  // The list starts below the page head; follow that offset when the head changes height.
  useLayoutEffect(() => {
    const sc = document.getElementById(APP_MAIN_SCROLL_VIEWPORT_ID);
    const wrap = listWrapRef.current;
    if (!sc || !wrap) return;
    const measure = () => {
      const m = wrap.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
      setScrollMargin(prev => (Math.abs(prev - m) > 0.5 ? m : prev));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(sc);
    const page = wrap.closest('.content-body');
    if (page) ro.observe(page);
    measure();
    return () => ro.disconnect();
  }, [songs.length]);

  // React Compiler incompatible-library rule: third-party hook/value the compiler cannot analyze; usage is correct.
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: songs.length,
    getScrollElement: () => document.getElementById(APP_MAIN_SCROLL_VIEWPORT_ID),
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: Math.max(8, Math.ceil(viewportH / ROW_HEIGHT_PX)),
    scrollMargin,
    getItemKey: i => ownedEntityKey(songs[i]),
  });

  return (
    <div ref={listWrapRef} style={{ height: rowVirtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
      {rowVirtualizer.getVirtualItems().map(vi => {
        const song = songs[vi.index];
        const active = currentTrack ? ownedEntityKey(currentTrack) === ownedEntityKey(song) : false;
        return (
          <div
            key={vi.key}
            data-index={vi.index}
            ref={rowVirtualizer.measureElement}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start - scrollMargin}px)` }}
          >
            <MobileSongRow
              song={song}
              index={vi.index}
              isActive={active}
              showEq={active && isPlaying}
              onPlay={onPlay}
              onMore={onMore}
            />
          </div>
        );
      })}
    </div>
  );
}
