import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { open } from '@tauri-apps/plugin-shell';
import ArtistBioTouch from './ArtistBioTouch';

const BIO = '<p>Formed in <b>Dresden</b> in 1986.</p><p>See <a href="https://example.org/band">their site</a> or <a href="/local">this</a>.</p>'
  + ' <a href="https://www.last.fm/music/x">Read more on Last.fm</a>';

/** jsdom has no layout; pretend the clamped excerpt is cut off (or not). */
function mockExcerptOverflow(overflows: boolean) {
  const sh = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(overflows ? 240 : 80);
  const ch = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(80);
  return () => { sh.mockRestore(); ch.mockRestore(); };
}

describe('ArtistBioTouch', () => {
  let restore: () => void = () => {};
  afterEach(() => { restore(); vi.mocked(open).mockClear(); });

  it('shows the bio as plain text with paragraphs kept apart and the Last.fm link dropped', () => {
    restore = mockExcerptOverflow(false);
    const { container } = render(<ArtistBioTouch artistName="Kaltfront" biography={BIO} />);
    expect(screen.getByRole('heading', { name: 'About the Artist' })).toBeInTheDocument();
    expect(container.querySelector('.mobile-artist-bio__excerpt')?.textContent)
      .toBe('Formed in Dresden in 1986. See their site or this.');
    expect(container.querySelector('.mobile-artist-bio__excerpt a')).toBeNull();
  });

  it('a short bio is plain text, without "Read more"', () => {
    restore = mockExcerptOverflow(false);
    render(<ArtistBioTouch artistName="Kaltfront" biography={BIO} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('a cut-off bio opens the whole text in a sheet', () => {
    restore = mockExcerptOverflow(true);
    render(<ArtistBioTouch artistName="Kaltfront" biography={BIO} />);
    fireEvent.click(screen.getByRole('button', { name: /Read more/ }));
    const sheet = screen.getByRole('dialog', { name: 'Kaltfront' });
    expect(within(sheet).getByText('Dresden').tagName).toBe('B');
    expect(within(sheet).queryByText('Read more on Last.fm')).toBeNull();
  });

  it('links in the sheet open in the browser instead of the app view', () => {
    restore = mockExcerptOverflow(true);
    render(<ArtistBioTouch artistName="Kaltfront" biography={BIO} />);
    fireEvent.click(screen.getByRole('button', { name: /Read more/ }));
    const sheet = screen.getByRole('dialog', { name: 'Kaltfront' });

    const web = within(sheet).getByText('their site');
    expect(fireEvent.click(web)).toBe(false); // default prevented
    expect(open).toHaveBeenCalledWith('https://example.org/band');

    vi.mocked(open).mockClear();
    expect(fireEvent.click(within(sheet).getByText('this'))).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it('renders nothing for a bio without text', () => {
    const { container } = render(<ArtistBioTouch artistName="Kaltfront" biography="<p> </p>" />);
    expect(container).toBeEmptyDOMElement();
  });
});
