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
  scrollRootId: string;
}

/**
 * The cover-grid switch in a touch page header: two, three or four covers per row, or the
 * list. Same dropdown as the sort control beside it, so both read as one kind of control.
 */
export default function MobileGridLayoutMenu({ surface, scrollRootId }: MobileGridLayoutMenuProps) {
  const { t } = useTranslation();
  const { layout } = useMobileGridLayout(surface);
  const setLayout = useMobileGridLayoutStore(s => s.setLayout);

  const options = MOBILE_GRID_LAYOUTS.map(value => ({
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
        document.getElementById(scrollRootId)?.scrollTo({ top: 0 });
        setLayout(surface, next);
      }}
      tooltip={t('albums.gridView')}
      ariaLabel={t('albums.gridView')}
      icon={<LayoutGrid size={14} />}
      iconOnly
      align="right"
    />
  );
}
