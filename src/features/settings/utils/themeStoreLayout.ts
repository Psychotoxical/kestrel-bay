import type { CSSProperties } from 'react';
import { IS_MOBILE_SHELL } from '@/lib/util/platform';

/** Install / Apply / Update / Uninstall / Show another in the theme store and spotlight. */
export const THEME_STORE_BUTTON_SIZE: CSSProperties = IS_MOBILE_SHELL
  ? { fontSize: 14, padding: '8px 16px' } // finger-sized in the touch shell
  : { fontSize: 12, padding: '4px 12px' };

/** Shared look of the store toolbar's sort and animation pickers (width is set per picker). */
export const THEME_STORE_SELECT_STYLE: CSSProperties = {
  alignSelf: 'stretch',
  boxSizing: 'border-box',
  padding: '0 var(--space-4)',
  background: 'var(--input-bg)',
  border: '1px solid var(--input-border)',
  borderRadius: 'var(--radius-md)',
  fontSize: 14,
  lineHeight: 1,
};
