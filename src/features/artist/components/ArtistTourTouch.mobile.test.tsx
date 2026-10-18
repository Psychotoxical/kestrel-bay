import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAuthStore } from '@/test/helpers/storeReset';
import { invokeMock, onInvoke } from '@/test/mocks/tauri';
import { useAuthStore } from '@/store/authStore';
import ArtistTourTouch from './ArtistTourTouch';

const SHOW = {
  datetime: '2026-11-12T20:00:00',
  venue_name: 'Markthalle',
  venue_city: 'Hamburg',
  venue_region: '',
  venue_country: 'Germany',
  url: 'https://www.bandsintown.com/e/1',
  on_sale_datetime: '',
  lineup: [],
};

beforeEach(() => {
  resetAuthStore();
  onInvoke('fetch_bandsintown_events', () => [SHOW]);
  onInvoke('open_external_url', () => null);
});

describe('ArtistTourTouch (touch shell)', () => {
  it('lists the upcoming shows when tour dates are on and opens one in the browser', async () => {
    useAuthStore.setState({ enableBandsintown: true });
    renderWithProviders(<ArtistTourTouch artistName="Tour Band A" />);

    const row = await screen.findByRole('button', { name: /Markthalle/ });
    expect(screen.getByText('On tour')).toBeInTheDocument();
    expect(row).toHaveTextContent('Hamburg, Germany');

    fireEvent.click(row);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('open_external_url', { url: SHOW.url }));
  });

  it('asks nothing and shows nothing while tour dates are off', async () => {
    useAuthStore.setState({ enableBandsintown: false });
    const { container } = renderWithProviders(<ArtistTourTouch artistName="Tour Band B" />);

    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
    expect(invokeMock.mock.calls.some(([cmd]) => cmd === 'fetch_bandsintown_events')).toBe(false);
  });

  it('shows nothing for an artist without upcoming shows', async () => {
    useAuthStore.setState({ enableBandsintown: true });
    onInvoke('fetch_bandsintown_events', () => []);
    const { container } = renderWithProviders(<ArtistTourTouch artistName="Tour Band C" />);

    await waitFor(() => expect(invokeMock.mock.calls.some(([cmd]) => cmd === 'fetch_bandsintown_events')).toBe(true));
    expect(container).toBeEmptyDOMElement();
  });
});
