import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetAuthStore } from '@/test/helpers/storeReset';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { LyricsTab } from './LyricsTab';

beforeEach(resetAuthStore);

describe('LyricsTab (touch shell)', () => {
  it('leaves out the scroll style: on a phone-sized lyrics pane both styles read the same', () => {
    renderWithProviders(<LyricsTab />);

    expect(screen.queryByText('Lyrics scroll style')).not.toBeInTheDocument();
    expect(screen.getByText('Pronunciation')).toBeInTheDocument();
  });
});
