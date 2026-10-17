import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAuthStore } from '@/store/authStore';
import { useTrackListCoverArtEnabled } from './useTrackListCoverArtSettings';

describe('track list covers in the touch shell', () => {
  it('the queue shows covers as the other touch song lists, whatever the desktop toggle says', () => {
    useAuthStore.setState({ queueTrackListCovers: false });
    const { result } = renderHook(() => useTrackListCoverArtEnabled('queue'));
    expect(result.current).toBe(true);
  });
});
