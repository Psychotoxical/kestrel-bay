/**
 * The cover-grid switch in a touch page header: 2 / 3 / 4 covers or the list, remembered
 * per page, with the page scrolled back to the top on a switch.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import MobileGridLayoutMenu from './MobileGridLayoutMenu';
import { useMobileGridLayoutStore } from '../store/mobileGridLayoutStore';

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Grid view' }));
const choose = (name: string) => fireEvent.click(screen.getByRole('option', { name }));

describe('MobileGridLayoutMenu', () => {
  beforeEach(() => {
    useMobileGridLayoutStore.setState({ layoutBySurface: {} });
    document.body.innerHTML = '';
  });

  it('offers 2, 3 and the list, with the current layout selected', () => {
    renderWithProviders(<MobileGridLayoutMenu surface="albums" scrollRootId="scroll" />);
    open();
    expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(['2', '3', 'List view']);
    expect(screen.getByRole('option', { name: '2' }).getAttribute('aria-selected')).toBe('true');
  });

  it('a choice is stored for this page only', () => {
    renderWithProviders(<MobileGridLayoutMenu surface="albums" scrollRootId="scroll" />);
    open();
    choose('3');
    expect(useMobileGridLayoutStore.getState().layoutBySurface).toEqual({ albums: 3 });
  });

  it('the list is stored as the list', () => {
    renderWithProviders(<MobileGridLayoutMenu surface="new-releases" scrollRootId="scroll" />);
    open();
    choose('List view');
    expect(useMobileGridLayoutStore.getState().layoutBySurface).toEqual({ 'new-releases': 'list' });
  });

  it('scrolls the page back to the top on a switch, not when the choice is unchanged', () => {
    const root = document.createElement('div');
    root.id = 'scroll';
    const calls: unknown[] = [];
    root.scrollTo = ((arg: unknown) => { calls.push(arg); }) as typeof root.scrollTo;
    document.body.appendChild(root);

    renderWithProviders(<MobileGridLayoutMenu surface="albums" scrollRootId="scroll" />);
    open();
    choose('2');
    expect(calls).toEqual([]);
    open();
    choose('3');
    expect(calls).toEqual([{ top: 0 }]);
  });
});

describe('MobileGridLayoutMenu on other pages', () => {
  beforeEach(() => {
    useMobileGridLayoutStore.setState({ layoutBySurface: {} });
  });

  it('a page without a list offers the cover counts only', () => {
    renderWithProviders(<MobileGridLayoutMenu surface="playlists" allowList={false} />);
    open();
    expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(['2', '3']);
  });

  it('a page with its own list switch gets the list from it and keeps the count here', () => {
    const switches: boolean[] = [];
    const { rerender } = renderWithProviders(
      <MobileGridLayoutMenu surface="artists" listActive={false} onListChange={list => switches.push(list)} />,
    );
    open();
    choose('3');
    expect(useMobileGridLayoutStore.getState().layoutBySurface).toEqual({ artists: 3 });
    expect(switches).toEqual([false]);

    rerender(<MobileGridLayoutMenu surface="artists" listActive onListChange={list => switches.push(list)} />);
    open();
    expect(screen.getByRole('option', { name: 'List view' }).getAttribute('aria-selected')).toBe('true');
    choose('2');
    expect(switches).toEqual([false, false]);
    expect(useMobileGridLayoutStore.getState().layoutBySurface).toEqual({ artists: 2 });
  });
});
