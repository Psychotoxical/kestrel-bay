export type MobileTabId = 'mainstage' | 'library' | 'orbit' | 'playlists';

export const MOBILE_TAB_ROOTS: Record<MobileTabId, string> = {
  mainstage: '/',
  library: '/library',
  orbit: '/orbit',
  playlists: '/playlists',
};

/** Routes reached from the Library tab; a trailing `/` marks a detail-route prefix. */
const LIBRARY_ROUTES = [
  '/library', '/albums', '/album/', '/artists', '/artist/', '/tracks', '/genres', '/moods',
  '/favorites', '/radio', '/composers', '/composer/', '/folders', '/new-releases', '/most-played',
  '/lossless-albums', '/random', '/lucky-mix', '/label/', '/shared', '/offline', '/search',
];

function matchesRoute(pathname: string, route: string): boolean {
  if (route.endsWith('/')) return pathname.startsWith(route);
  return pathname === route || pathname.startsWith(`${route}/`);
}

/** The tab a route belongs to; `null` for pages outside the tabs (settings, help, …). */
export function activeMobileTab(pathname: string): MobileTabId | null {
  if (pathname === '/') return 'mainstage';
  if (matchesRoute(pathname, '/orbit')) return 'orbit';
  if (matchesRoute(pathname, '/playlists')) return 'playlists';
  if (LIBRARY_ROUTES.some(route => matchesRoute(pathname, route))) return 'library';
  return null;
}

export function isMobileTabRoot(pathname: string): boolean {
  return Object.values(MOBILE_TAB_ROOTS).includes(pathname);
}

/** Pages whose touch layout draws its own top row (back button + actions). */
export function hasOwnMobileHeader(pathname: string): boolean {
  return pathname === '/albums' || pathname.startsWith('/album/') || pathname.startsWith('/artist/') || pathname.startsWith('/playlists/');
}

export const MOBILE_TAB_LABEL_KEYS: Record<MobileTabId, string> = {
  mainstage: 'sidebar.mainstage',
  library: 'sidebar.library',
  orbit: 'orbit.triggerLabel',
  playlists: 'sidebar.playlists',
};
