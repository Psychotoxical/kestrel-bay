import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';

vi.mock('@/features/whatsNew/hooks/useReleaseNotes', () => ({
  useReleaseNotes: () => ({
    loading: false,
    whatsNewEntry: { version: '1.0.0', date: '2026-10-17', body: '## Highlights\n\n- Something new' },
    changelogEntry: null,
  }),
}));

import WhatsNew from './WhatsNew';

describe("What's New in the touch shell", () => {
  it('is a page with a large title and no close button of its own', () => {
    renderWithProviders(<WhatsNew />);
    expect(screen.getByRole('heading', { level: 1, name: "What's New" })).toHaveClass('mobile-large-title');
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    expect(screen.getByText('Something new')).toBeInTheDocument();
  });
});
