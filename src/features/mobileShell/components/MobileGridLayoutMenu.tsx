import { LayoutGrid } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SortDropdown from '@/ui/SortDropdown';
import {
  MOBILE_GRID_LAYOUTS,
  isMobileGridLayout,
  useMobileGridLayout,
  useMobileGridLayoutStore,
  type MobileGridSurface,
} from '../store/mobileGridLayoutStore';

interface MobileGridLayoutMenuProps {
  surface: MobileGridSurface;
  /** Viewport the page scrolls; reset to the top on a switch (rows change height). */
  scrollRootId?: string;
  /** Pages without a list layout offer the cover counts only. */
  allowList?: boolean;
  /**
   * For a page that keeps its own grid/list switch (Artists): whether its list shows, and
   * how to switch it. The cover count stays in this menu's store either way.
   */
  listActive?: boolean;
  onListChange?: (list: boolean) => void;
}

/**
 * The cover-grid switch in a touch page header: two or three covers per row, or the list.
 * Same dropdown as the sort control beside it, so both read as one kind of control.
 */
export default function MobileGridLayoutMenu({
  surface, scrollRootId, allowList = true, listActive, onListChange,
}: MobileGridLayoutMenuProps) {
  const { t } = useTranslation();
  const { layout: stored, columns } = useMobileGridLayout(surface);
  const setLayout = useMobileGridLayoutStore(s => s.setLayout);
  const external = onListChange !== undefined;
  const layout = external ? (listActive ? 'list' : (columns ?? 2)) : stored;

  const options = MOBILE_GRID_LAYOUTS
    .filter(value => allowList || value !== 'list')
    .map(value => ({
      value: String(value),
      label: value === 'list' ? t('artists.listView') : String(value),
    }));

  return (
    <SortDropdown
      value={String(layout)}
      options={options}
      onChange={value => {
        const next = value === 'list' ? 'list' : Number(value);
        if (!isMobileGridLayout(next) || next === layout) return;
        // A list row is far shorter than a cover row; keeping the offset would clamp the
        // page near the new bottom, where the load-more sentinel waits.
        if (scrollRootId) document.getElementById(scrollRootId)?.scrollTo({ top: 0 });
        if (external) {
          if (next !== 'list') setLayout(surface, next);
          onListChange(next === 'list');
        } else {
          setLayout(surface, next);
        }
      }}
      tooltip={t('albums.gridView')}
      ariaLabel={t('albums.gridView')}
      icon={<LayoutGrid size={14} />}
      iconOnly
      align="right"
    />
  );
}
