import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { PlaylistLayoutCustomizer } from './PlaylistLayoutCustomizer';

beforeEach(resetAllStores);

describe('PlaylistLayoutCustomizer (touch shell)', () => {
  it('leaves out shuffle, offline cache and the ZIP download: the touch menu always has the first two and no ZIP', () => {
    renderWithProviders(<PlaylistLayoutCustomizer />);

    expect(screen.queryByText('Shuffle')).not.toBeInTheDocument();
    expect(screen.queryByText('Cache playlist offline')).not.toBeInTheDocument();
    expect(screen.queryByText('Download (ZIP)')).not.toBeInTheDocument();
    expect(screen.getByText('Add to Queue')).toBeInTheDocument();
  });
});
