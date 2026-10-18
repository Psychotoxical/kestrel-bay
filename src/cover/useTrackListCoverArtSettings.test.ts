import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import { useTrackListCoverArtEnabled } from './useTrackListCoverArtSettings';

describe('track list covers (desktop)', () => {
  it('the queue follows its own toggle', () => {
    useAuthStore.setState({ queueTrackListCovers: false });
    const { result } = renderHook(() => useTrackListCoverArtEnabled('queue'));
    expect(result.current).toBe(false);
  });

  it('the browse lists follow their own toggle', () => {
    useThemeStore.setState({ trackListCoverArtOnPages: false });
    const { result } = renderHook(() => useTrackListCoverArtEnabled('pages'));
    expect(result.current).toBe(false);
  });
});
