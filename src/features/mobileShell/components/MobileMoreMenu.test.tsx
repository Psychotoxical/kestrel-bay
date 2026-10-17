import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { useAuthStore } from '@/store/authStore';
import { useShareSettingsStore } from '@/features/share';
import MobileMoreMenu, { type MobileMoreMenuItem } from './MobileMoreMenu';

const action = (id: string, over: Partial<{ disabled: boolean; onSelect: () => void }> = {}): MobileMoreMenuItem => ({
  id, label: `Action ${id}`, icon: null, onSelect: over.onSelect ?? vi.fn(), disabled: over.disabled,
});

const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'More options' }));

describe('MobileMoreMenu', () => {
  beforeEach(() => {
    resetAllStores();
  });

  it('keeps the actions hidden until "…" is tapped', () => {
    renderWithProviders(<MobileMoreMenu items={[action('a'), action('b')]} />);
    expect(screen.queryByRole('menu')).toBeNull();
    openMenu();
    expect(screen.getAllByRole('menuitem').map(el => el.textContent)).toEqual(['Action a', 'Action b']);
  });

  it('runs the picked action and closes', () => {
    const onSelect = vi.fn();
    renderWithProviders(<MobileMoreMenu items={[action('a', { onSelect })]} />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Action a' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('a disabled action cannot be picked', () => {
    const onSelect = vi.fn();
    renderWithProviders(<MobileMoreMenu items={[action('a', { disabled: true, onSelect })]} />);
    openMenu();
    const item = screen.getByRole('menuitem', { name: 'Action a' });
    expect(item).toBeDisabled();
    fireEvent.click(item);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('closes on a tap outside', () => {
    renderWithProviders(<><MobileMoreMenu items={[action('a')]} /><p>outside</p></>);
    openMenu();
    fireEvent.pointerDown(screen.getByText('outside'));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('a custom trigger replaces the "…" button and toggles the list', () => {
    const { container } = renderWithProviders(
      <MobileMoreMenu
        items={[action('a')]}
        placement="above"
        trigger={({ open, toggle }) => (
          <button type="button" aria-expanded={open} onClick={toggle}>Pick</button>
        )}
      />,
    );
    expect(screen.queryByRole('button', { name: 'More options' })).toBeNull();
    expect(container.querySelector('.mobile-more-menu--above')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Pick' }));
    expect(screen.getByRole('menuitem', { name: 'Action a' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pick' })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Pick' }));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('renders nothing without actions', () => {
    const { container } = renderWithProviders(<MobileMoreMenu items={[]} />);
    expect(container.querySelector('.mobile-more-menu')).toBeNull();
  });

  it('turns the share slot into one entry per share method', () => {
    const serverId = useAuthStore.getState().addServer({
      name: 'T', url: 'https://x.test', username: 'tester', password: 'p',
    });
    const share = { id: 'share', share: { kind: 'playlist' as const, resourceIds: ['pl-1'], serverIds: [serverId] } };

    useShareSettingsStore.setState({ navidromeSharingEnabled: false });
    const { unmount } = renderWithProviders(<MobileMoreMenu items={[share]} />);
    openMenu();
    expect(screen.getAllByRole('menuitem').map(el => el.textContent)).toEqual(['Share link']);
    expect(screen.getByRole('menuitem', { name: 'Share link' })).toBeEnabled();
    unmount();

    useShareSettingsStore.setState({ navidromeSharingEnabled: true });
    renderWithProviders(<MobileMoreMenu items={[share]} />);
    openMenu();
    expect(screen.getAllByRole('menuitem').map(el => el.textContent)).toEqual([
      'Share link · Psysonic',
      'Share link · Navidrome',
    ]);
  });
});
