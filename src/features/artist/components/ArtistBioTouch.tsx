import { useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { open } from '@tauri-apps/plugin-shell';
import { MobileSheet } from '@/features/mobileShell';
import { sanitizeBioHtml } from '@/lib/util/sanitizeHtml';

interface Props {
  artistName: string;
  /** Server biography HTML (Last.fm etc.). */
  biography: string;
}

function bioText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // textContent glues paragraphs together ("…1986.Their first…").
  doc.body.querySelectorAll('p, br, div, li').forEach(el => el.after(' '));
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Links in the bio open in the browser; following them inside the app's web view would replace the app. */
function openLinksExternally(e: MouseEvent<HTMLElement>) {
  const link = (e.target as Element).closest('a[href]');
  if (!link) return;
  e.preventDefault();
  const href = link.getAttribute('href') ?? '';
  if (/^https?:\/\//i.test(href)) void open(href);
}

/**
 * Touch layout of the artist bio: a section heading like the other sections, a
 * card with the first lines of the text and, when there is more, a tap that
 * opens the whole bio in a sheet. No artist image: the hero above shows it.
 */
export default function ArtistBioTouch({ artistName, biography }: Props) {
  const { t } = useTranslation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const excerptRef = useRef<HTMLSpanElement | null>(null);

  const html = useMemo(() => sanitizeBioHtml(biography), [biography]);
  const excerpt = useMemo(() => bioText(html), [html]);

  useLayoutEffect(() => {
    const el = excerptRef.current;
    setOverflows(!!el && el.scrollHeight - el.clientHeight > 1);
  }, [excerpt]);

  if (!excerpt) return null;

  const text = <span ref={excerptRef} className="mobile-artist-bio__excerpt">{excerpt}</span>;

  return (
    <section className="mobile-artist-bio">
      <h2 className="section-title">{t('nowPlaying.aboutArtist')}</h2>
      {overflows ? (
        <button type="button" className="mobile-artist-bio__card" onClick={() => setSheetOpen(true)}>
          {text}
          <span className="mobile-artist-bio__more">
            {t('nowPlayingInfo.bioReadMore')}
            <ChevronRight size={16} aria-hidden="true" />
          </span>
        </button>
      ) : (
        <div className="mobile-artist-bio__card">{text}</div>
      )}
      {sheetOpen && (
        <MobileSheet title={artistName} onClose={() => setSheetOpen(false)} className="mobile-sheet--bio">
          <div
            className="mobile-artist-bio__full"
            onClick={openLinksExternally}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </MobileSheet>
      )}
    </section>
  );
}
