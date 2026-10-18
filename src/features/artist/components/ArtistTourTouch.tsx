import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { fetchBandsintownEvents, type BandsintownEvent } from '@/lib/api/bandsintown';
import { openExternalUrl as open } from '@/lib/api/externalLink';
import { usableLocale } from '@/lib/format/localeTag';
import { useAuthStore } from '@/store/authStore';

const TOUR_LIMIT = 5;

function dateParts(iso: string, locale: string | undefined) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return null;
  const tag = usableLocale(locale);
  return {
    month: d.toLocaleString(tag, { month: 'short' }),
    day: String(d.getDate()),
    when: d.toLocaleString(tag, { weekday: 'short', hour: '2-digit', minute: '2-digit' }),
  };
}

interface Props {
  artistName: string;
}

/**
 * Touch layout of the tour dates (Bandsintown) on the artist page. The touch
 * player has no Now Playing info tab, so this is where the opt-in from
 * Settings → Integrations shows. Nothing renders while the setting is off or
 * the artist has no upcoming shows; a show opens its page in the browser.
 */
export default function ArtistTourTouch({ artistName }: Props) {
  const { t, i18n } = useTranslation();
  const enabled = useAuthStore(s => s.enableBandsintown);
  const [loaded, setLoaded] = useState<{ artist: string; events: BandsintownEvent[] } | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!enabled || !artistName) return;
    let cancelled = false;
    void fetchBandsintownEvents(artistName).then(events => {
      if (!cancelled) setLoaded({ artist: artistName, events });
    });
    return () => { cancelled = true; };
  }, [artistName, enabled]);

  const events = enabled && loaded?.artist === artistName ? loaded.events : [];
  if (events.length === 0) return null;

  const locale = i18n.resolvedLanguage ?? i18n.language;
  const visible = showAll ? events : events.slice(0, TOUR_LIMIT);
  const hidden = events.length - visible.length;

  return (
    <section className="mobile-artist-tour">
      <h2 className="section-title">{t('nowPlayingInfo.onTour')}</h2>
      <ul className="mobile-artist-tour__list">
        {visible.map((ev, idx) => {
          const parts = dateParts(ev.datetime, locale);
          const place = [ev.venueCity, ev.venueRegion, ev.venueCountry].filter(Boolean).join(', ');
          return (
            <li key={`${ev.datetime}-${ev.venueName}-${idx}`}>
              <button
                type="button"
                className="mobile-artist-tour__row"
                disabled={!ev.url}
                onClick={() => { if (ev.url) open(ev.url).catch(() => {}); }}
              >
                {parts && (
                  <span className="mobile-artist-tour__date" aria-hidden="true">
                    <span className="mobile-artist-tour__month">{parts.month}</span>
                    <span className="mobile-artist-tour__day">{parts.day}</span>
                  </span>
                )}
                <span className="mobile-artist-tour__text">
                  <span className="mobile-artist-tour__venue">{ev.venueName || place}</span>
                  <span className="mobile-artist-tour__place">{[parts?.when, place].filter(Boolean).join(' · ')}</span>
                </span>
                {ev.url && <ChevronRight size={18} aria-hidden="true" className="mobile-artist-tour__chevron" />}
              </button>
            </li>
          );
        })}
      </ul>
      {(hidden > 0 || showAll) && events.length > TOUR_LIMIT && (
        <button type="button" className="mobile-artist-tour__more" onClick={() => setShowAll(v => !v)}>
          {showAll ? t('nowPlayingInfo.showLessTours') : t('nowPlayingInfo.showMoreTours', { count: hidden })}
        </button>
      )}
      <p className="mobile-artist-tour__credit">{t('nowPlayingInfo.poweredByBandsintown')}</p>
    </section>
  );
}
