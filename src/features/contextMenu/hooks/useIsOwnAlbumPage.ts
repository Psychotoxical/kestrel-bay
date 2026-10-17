import { useLocation } from 'react-router';
import { IS_MOBILE_SHELL } from '@/lib/util/platform';

/**
 * Touch shell: whether the menu sits on this album's own page, where "Open
 * album" would lead to the page already open. Always false on the desktop.
 */
export function useIsOwnAlbumPage(): (albumId: string | undefined) => boolean {
  const { pathname } = useLocation();
  return albumId => IS_MOBILE_SHELL && !!albumId && pathname === `/album/${albumId}`;
}
