import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AlarmTimeFields from './AlarmTimeFields';

describe('AlarmTimeFields', () => {
  it('takes typed hours, moves on to the minutes and clamps them', () => {
    const onChange = vi.fn();
    render(<AlarmTimeFields hour={7} minute={0} onChange={onChange} />);
    const [hours, minutes] = screen.getAllByRole('textbox');
    expect(hours).toHaveValue('07');
    expect(hours).toHaveAttribute('inputmode', 'numeric');

    fireEvent.focus(hours);
    fireEvent.change(hours, { target: { value: '22' } });
    expect(onChange).toHaveBeenLastCalledWith(22, 0);
    expect(minutes).toHaveFocus();

    fireEvent.focus(minutes);
    fireEvent.change(minutes, { target: { value: '75' } });
    fireEvent.blur(minutes);
    expect(onChange).toHaveBeenLastCalledWith(7, 59);
  });

  it('keeps the old value when a field is left empty', () => {
    const onChange = vi.fn();
    render(<AlarmTimeFields hour={7} minute={30} onChange={onChange} />);
    const [hours] = screen.getAllByRole('textbox');
    fireEvent.focus(hours);
    fireEvent.change(hours, { target: { value: '' } });
    fireEvent.blur(hours);
    expect(onChange).not.toHaveBeenCalled();
    expect(hours).toHaveValue('07');
  });
});
