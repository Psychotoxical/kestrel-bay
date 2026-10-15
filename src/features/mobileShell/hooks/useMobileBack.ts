import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { activeMobileTab, MOBILE_TAB_ROOTS } from '@/features/mobileShell/utils/mobileTabs';

/**
 * Back navigation for the touch shell. React Router stores the history
 * position in `history.state.idx`; without in-app history (cold deep link)
 * it falls back to the root of the tab the page belongs to.
 */
export function useMobileBack(): () => void {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(MOBILE_TAB_ROOTS[activeMobileTab(pathname) ?? 'mainstage'], { replace: true });
  }, [navigate, pathname]);
}
