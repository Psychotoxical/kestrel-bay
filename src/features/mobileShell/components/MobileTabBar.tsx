import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Disc3, Library, ListMusic, Orbit as OrbitIcon, Search } from 'lucide-react';
import { MobileSearchOverlay } from '@/features/search';
import { OPEN_SEARCH_EVENT } from '@/lib/dom/openSearch';
import { APP_MAIN_SCROLL_VIEWPORT_ID } from '@/constants/appScroll';
import { activeMobileTab, MOBILE_TAB_ROOTS, type MobileTabId } from '@/features/mobileShell/utils/mobileTabs';
import { useCollapseBarsOnScroll } from '@/features/mobileShell/hooks/useCollapseBarsOnScroll';
import { useOrbitPendingApprovalCount, useOrbitStore } from '@/features/orbit';

const TABS: ReadonlyArray<{ id: MobileTabId; icon: typeof Disc3; labelKey: string }> = [
  { id: 'mainstage', icon: Disc3, labelKey: 'sidebar.mainstage' },
  { id: 'library', icon: Library, labelKey: 'sidebar.library' },
  { id: 'orbit', icon: OrbitIcon, labelKey: 'orbit.triggerLabel' },
  { id: 'playlists', icon: ListMusic, labelKey: 'sidebar.playlists' },
];

/**
 * Floating glass tab bar with the round search button beside it. While the page
 * scrolls down it folds to a single Mainstage button (its first tab), with the
 * player bar moving in between it and the search button.
 */
export default function MobileTabBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = activeMobileTab(pathname);
  const orbitLive = useOrbitStore(s => s.role !== null && s.phase === 'active');
  // Host: guest suggestions waiting for approval, shown on the tab wherever you are.
  const pendingApprovals = useOrbitPendingApprovalCount();
  const [searchOpen, setSearchOpen] = useState(false);
  useCollapseBarsOnScroll();

  useEffect(() => {
    const openSearch = (event: Event) => {
      event.preventDefault();
      setSearchOpen(true);
    };
    window.addEventListener(OPEN_SEARCH_EVENT, openSearch);
    return () => window.removeEventListener(OPEN_SEARCH_EVENT, openSearch);
  }, []);

  const openTab = (id: MobileTabId) => {
    const root = MOBILE_TAB_ROOTS[id];
    if (pathname === root) {
      document.getElementById(APP_MAIN_SCROLL_VIEWPORT_ID)?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    navigate(root);
  };

  return (
    <>
      <div className="mobile-tabbar" data-visualizer-overlay-exempt="shell">
        <nav className="mobile-tabbar__tabs mobile-glass">
          {TABS.map(({ id, icon: Icon, labelKey }) => (
            <button
              key={id}
              type="button"
              className={`mobile-tabbar__tab${active === id ? ' is-active' : ''}${id === 'orbit' && orbitLive ? ' is-live' : ''}`}
              aria-current={active === id ? 'page' : undefined}
              onClick={() => openTab(id)}
            >
              <Icon size={23} strokeWidth={1.8} aria-hidden="true" />
              <span>{t(labelKey)}</span>
              {/* A session is running: the Orbit tab is its room. */}
              {id === 'orbit' && orbitLive && (pendingApprovals > 0 ? (
                <>
                  <span className="mobile-tabbar__badge" aria-hidden="true">{pendingApprovals > 99 ? '99+' : pendingApprovals}</span>
                  <span className="mobile-visually-hidden">{`${pendingApprovals} ${t('orbit.approvalTitle')}`}</span>
                </>
              ) : (
                <>
                  <span className="mobile-tabbar__live-dot" aria-hidden="true" />
                  <span className="mobile-visually-hidden">{t('orbit.guestLive')}</span>
                </>
              ))}
            </button>
          ))}
        </nav>
        <button
          type="button"
          className="mobile-tabbar__search mobile-glass"
          aria-label={t('search.title')}
          onClick={() => setSearchOpen(true)}
        >
          <Search size={23} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      {searchOpen && <MobileSearchOverlay onClose={() => setSearchOpen(false)} />}
    </>
  );
}
