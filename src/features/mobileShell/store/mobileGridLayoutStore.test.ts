import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  sanitizeMobileGridLayouts,
  useMobileGridLayout,
  useMobileGridLayoutStore,
} from './mobileGridLayoutStore';

describe('mobile grid layout', () => {
  beforeEach(() => {
    useMobileGridLayoutStore.setState({ layoutBySurface: {} });
  });

  it('starts with two covers per row', () => {
    const { result } = renderHook(() => useMobileGridLayout('albums'));
    expect(result.current).toEqual({ layout: 2, columns: 2, isList: false });
  });

  it('keeps one layout per page', () => {
    useMobileGridLayoutStore.getState().setLayout('albums', 3);
    expect(renderHook(() => useMobileGridLayout('albums')).result.current.columns).toBe(3);
    expect(renderHook(() => useMobileGridLayout('new-releases')).result.current.columns).toBe(2);
  });

  it('the list forces no column count', () => {
    useMobileGridLayoutStore.getState().setLayout('albums', 'list');
    expect(renderHook(() => useMobileGridLayout('albums')).result.current).toEqual({
      layout: 'list',
      columns: undefined,
      isList: true,
    });
  });

  it('drops unknown pages and layouts from saved state', () => {
    expect(sanitizeMobileGridLayouts({ albums: 3, 'new-releases': 'list', gone: 2, other: 7 })).toEqual({
      albums: 3,
      'new-releases': 'list',
    });
    expect(sanitizeMobileGridLayouts({ albums: 4 })).toEqual({});
    expect(sanitizeMobileGridLayouts(null)).toEqual({});
  });
});
