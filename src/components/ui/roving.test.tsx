import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Segmented } from './forms';
import { rovingTarget } from './roving';

/** Roving focus in a segmented radio group: one Tab stop, and the selection follows the arrows. */

const OPTIONS: { value: string; label: string }[] = [
  { value: '24', label: '24h' },
  { value: '48', label: '48h' },
  { value: '72', label: '72h' },
];

/** A controlled group between two buttons, so the tests can Tab into and out of it. */
function Harness({
  initial = '48',
  onChange,
}: {
  initial?: string;
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <button type="button">Before</button>
      <Segmented
        label="Forecast range"
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
        options={OPTIONS}
      />
      <button type="button">After</button>
    </>
  );
}

const radio = (name: string) => screen.getByRole('radio', { name });
const checked = () =>
  screen
    .getAllByRole('radio')
    .filter((r) => r.getAttribute('aria-checked') === 'true')
    .map((r) => r.textContent);

describe('rovingTarget', () => {
  it('moves forwards and backwards and wraps at both ends', () => {
    expect(rovingTarget('ArrowRight', 0, 3, 'horizontal')).toBe(1);
    expect(rovingTarget('ArrowRight', 2, 3, 'horizontal')).toBe(0);
    expect(rovingTarget('ArrowLeft', 1, 3, 'horizontal')).toBe(0);
    expect(rovingTarget('ArrowLeft', 0, 3, 'horizontal')).toBe(2);
  });

  it('jumps to the ends with Home and End', () => {
    expect(rovingTarget('Home', 2, 3, 'horizontal')).toBe(0);
    expect(rovingTarget('End', 0, 3, 'both')).toBe(2);
  });

  it('uses Up and Down only when the group asks for both axes', () => {
    expect(rovingTarget('ArrowDown', 0, 3, 'both')).toBe(1);
    expect(rovingTarget('ArrowUp', 0, 3, 'both')).toBe(2);
    expect(rovingTarget('ArrowDown', 0, 3, 'horizontal')).toBeUndefined();
    expect(rovingTarget('ArrowUp', 0, 3, 'horizontal')).toBeUndefined();
  });

  it('ignores every other key, and an empty group', () => {
    expect(rovingTarget('a', 0, 3, 'both')).toBeUndefined();
    expect(rovingTarget('Tab', 0, 3, 'both')).toBeUndefined();
    expect(rovingTarget('ArrowRight', 0, 0, 'both')).toBeUndefined();
  });
});

describe('Segmented: roving focus', () => {
  it('has radio-group semantics with exactly one option in the Tab order', () => {
    render(<Harness />);
    expect(screen.getByRole('radiogroup', { name: 'Forecast range' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('tabindex'))).toEqual([
      '-1',
      '0',
      '-1',
    ]);
    expect(checked()).toEqual(['48h']);
  });

  it('is a single Tab stop: Tab enters on the checked option and the next Tab leaves', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Before' })).toHaveFocus();
    await user.tab();
    expect(radio('48h')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(radio('48h')).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Before' })).toHaveFocus();
  });

  it('moves and selects with Right and Left, wrapping at the ends', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(value: string) => void>();
    render(<Harness onChange={onChange} />);
    radio('48h').focus();

    await user.keyboard('{ArrowRight}');
    expect(radio('72h')).toHaveFocus();
    expect(checked()).toEqual(['72h']);

    await user.keyboard('{ArrowRight}');
    expect(radio('24h')).toHaveFocus();
    expect(checked()).toEqual(['24h']);

    await user.keyboard('{ArrowLeft}');
    expect(radio('72h')).toHaveFocus();
    expect(checked()).toEqual(['72h']);
    expect(onChange.mock.calls.map((call) => call[0])).toEqual(['72', '24', '72']);
  });

  it('moves and selects with Down and Up as well, as a radio group does', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    radio('48h').focus();
    await user.keyboard('{ArrowDown}');
    expect(radio('72h')).toHaveFocus();
    expect(checked()).toEqual(['72h']);
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(radio('24h')).toHaveFocus();
    expect(checked()).toEqual(['24h']);
    await user.keyboard('{ArrowUp}');
    expect(radio('72h')).toHaveFocus();
  });

  it('jumps to the first and last option with Home and End', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    radio('48h').focus();
    await user.keyboard('{End}');
    expect(radio('72h')).toHaveFocus();
    expect(checked()).toEqual(['72h']);
    await user.keyboard('{Home}');
    expect(radio('24h')).toHaveFocus();
    expect(checked()).toEqual(['24h']);
    // Home on the first option keeps focus and does not report a change that did not happen.
    await user.keyboard('{Home}');
    expect(radio('24h')).toHaveFocus();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('keeps the Tab stop on the selection after the arrows moved it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    radio('48h').focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('tabindex'))).toEqual([
      '-1',
      '-1',
      '0',
    ]);
    await user.tab();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(radio('72h')).toHaveFocus();
  });

  it('leaves other keys and modified arrows alone', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    radio('48h').focus();
    await user.keyboard('a{Alt>}{ArrowLeft}{/Alt}{Control>}{ArrowRight}{/Control}');
    expect(radio('48h')).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('still selects with a click or the Space key', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(radio('24h'));
    expect(checked()).toEqual(['24h']);
    radio('72h').focus();
    await user.keyboard(' ');
    expect(checked()).toEqual(['72h']);
  });

  it('puts the first option in the Tab order when nothing is selected', () => {
    render(<Harness initial="none" />);
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('tabindex'))).toEqual([
      '0',
      '-1',
      '-1',
    ]);
    expect(checked()).toEqual([]);
  });
});
