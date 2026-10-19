/**
 * Touch shell: the add / edit server form asks the phone keyboard for plain text in
 * addresses and the user name (no capital "H" in "http", no space after a dot), and
 * for the URL keyboard in the two address fields. The server name keeps normal typing.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { AddServerForm } from './AddServerForm';

function fieldOf(label: string): HTMLInputElement {
  const input = screen.getByText(label).closest('.form-group')?.querySelector('input');
  if (!input) throw new Error(`no input for ${label}`);
  return input;
}

describe('AddServerForm on the phone keyboard', () => {
  it('addresses: no capital, no correction, URL keyboard', () => {
    renderWithProviders(<AddServerForm onSave={vi.fn()} onCancel={vi.fn()} />);
    for (const label of ['Server URL', 'Second address (optional)']) {
      const input = fieldOf(label);
      expect(input.getAttribute('autocapitalize')).toBe('none');
      expect(input.getAttribute('autocorrect')).toBe('off');
      expect(input.getAttribute('spellcheck')).toBe('false');
      expect(input.getAttribute('inputmode')).toBe('url');
    }
  });

  it('user name: plain text, but the normal keyboard', () => {
    renderWithProviders(<AddServerForm onSave={vi.fn()} onCancel={vi.fn()} />);
    const input = fieldOf('Username');
    expect(input.getAttribute('autocapitalize')).toBe('none');
    expect(input.getAttribute('autocorrect')).toBe('off');
    expect(input.getAttribute('inputmode')).toBeNull();
  });

  it('the server name is left alone', () => {
    renderWithProviders(<AddServerForm onSave={vi.fn()} onCancel={vi.fn()} />);
    const input = fieldOf('Server Name');
    expect(input.getAttribute('autocapitalize')).toBeNull();
    expect(input.getAttribute('autocorrect')).toBeNull();
  });
});
