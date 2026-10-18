import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import type { PlaylistLayoutItemConfig } from '@/features/playlist';
import { mergeReorderedItems, PlaylistLayoutCustomizer } from './PlaylistLayoutCustomizer';

beforeEach(resetAllStores);

describe('PlaylistLayoutCustomizer (desktop)', () => {
  it('offers shuffle, offline cache and the ZIP download', () => {
    renderWithProviders(<PlaylistLayoutCustomizer />);

    expect(screen.getByText('Shuffle')).toBeInTheDocument();
    expect(screen.getByText('Cache playlist offline')).toBeInTheDocument();
    expect(screen.getByText('Download (ZIP)')).toBeInTheDocument();
  });
});

describe('mergeReorderedItems', () => {
  it('puts the reordered items back around the hidden ones, which keep their slots', () => {
    const all: PlaylistLayoutItemConfig[] = [
      { id: 'shuffle', visible: true },
      { id: 'enqueue', visible: true },
      { id: 'downloadZip', visible: false },
      { id: 'share', visible: true },
    ];
    const reordered: PlaylistLayoutItemConfig[] = [
      { id: 'share', visible: true },
      { id: 'enqueue', visible: true },
    ];

    expect(mergeReorderedItems(all, reordered, new Set(['shuffle', 'downloadZip']))).toEqual([
      { id: 'shuffle', visible: true },
      { id: 'share', visible: true },
      { id: 'downloadZip', visible: false },
      { id: 'enqueue', visible: true },
    ]);
  });
});
