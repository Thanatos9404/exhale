import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button, buttonStyles } from './Button';
import { Segmented, Switch, inputClass } from './forms';

/**
 * Target size (WCAG 2.5.8): every interactive primitive is at least 24 by 24 CSS pixels, and a
 * button is at least 32 by 32 so it still passes when it holds nothing but an icon. jsdom does
 * no layout and the test run loads no CSS, so the sizes are read from the classes that set them.
 * The native checkbox and slider are sized in CSS and checked in tests/contrast.test.ts.
 */

const MIN_TARGET = 24;
const MIN_ICON_BUTTON = 32;
/** Tailwind's spacing scale: one unit is 0.25rem, 4px at the default root size. */
const SPACING_UNIT = 4;

/**
 * The pixel length the unprefixed utilities `<prefix>-<n>` or `<prefix>-[<n>px]` set, or 0.
 * Variant classes such as `md:h-4` are ignored: the base size is what must pass.
 */
function px(classes: string, prefix: string): number {
  const utility = new RegExp(`^${prefix}-(?:(\\d+(?:\\.\\d+)?)|\\[(\\d+(?:\\.\\d+)?)px\\])$`);
  return classes.split(/\s+/).reduce((length, name) => {
    const match = utility.exec(name);
    if (!match) return length;
    return match[1] !== undefined ? Number(match[1]) * SPACING_UNIT : Number(match[2]);
  }, 0);
}

/** The smallest box the classes guarantee: the larger of the fixed and the minimum size. */
function minBox(classes: string) {
  const size = px(classes, 'size');
  return {
    width: Math.max(size, px(classes, 'w'), px(classes, 'min-w')),
    height: Math.max(size, px(classes, 'h'), px(classes, 'min-h')),
  };
}

const SIZES = ['sm', 'md', 'lg'] as const;
const VARIANTS = ['primary', 'secondary', 'tertiary', 'error'] as const;

describe('target size: the class reader', () => {
  it('reads spacing-scale and arbitrary pixel sizes, and ignores variants', () => {
    expect(minBox('h-6 w-10')).toEqual({ width: 40, height: 24 });
    expect(minBox('size-[18px]')).toEqual({ width: 18, height: 18 });
    expect(minBox('h-8 min-w-8 px-2.5')).toEqual({ width: 32, height: 32 });
    expect(minBox('md:h-9 hover:w-9 text-sm')).toEqual({ width: 0, height: 0 });
  });

  it('fails a control that is too small (negative control)', () => {
    // The switch before the fix: 20px tall.
    expect(minBox('relative inline-flex h-5 w-9').height).toBeLessThan(MIN_TARGET);
  });
});

describe('target size: primitives', () => {
  it.each(SIZES.flatMap((size) => VARIANTS.map((variant) => ({ size, variant }))))(
    'Button $variant $size is at least 32 by 32, even with only an icon inside',
    ({ size, variant }) => {
      render(
        <Button size={size} variant={variant} aria-label="Close">
          <svg aria-hidden="true" width="12" height="12" />
        </Button>,
      );
      const box = minBox(screen.getByRole('button', { name: 'Close' }).className);
      expect(box.width).toBeGreaterThanOrEqual(MIN_ICON_BUTTON);
      expect(box.height).toBeGreaterThanOrEqual(MIN_ICON_BUTTON);
    },
  );

  it.each(SIZES)('the link that looks like a %s button is at least 32 by 32', (size) => {
    const box = minBox(buttonStyles('secondary', size));
    expect(box.width).toBeGreaterThanOrEqual(MIN_ICON_BUTTON);
    expect(box.height).toBeGreaterThanOrEqual(MIN_ICON_BUTTON);
  });

  it.each(['sm', 'md'] as const)('every option of a %s Segmented is at least 24 by 24', (size) => {
    render(
      <Segmented
        label="Theme"
        size={size}
        value="a"
        onChange={() => {}}
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: <svg aria-hidden="true" />, title: 'B' },
        ]}
      />,
    );
    for (const option of screen.getAllByRole('radio')) {
      const box = minBox(option.className);
      expect(box.width).toBeGreaterThanOrEqual(MIN_TARGET);
      expect(box.height).toBeGreaterThanOrEqual(MIN_TARGET);
    }
  });

  it.each([true, false])('Switch (checked: %s) is at least 24 by 24', (checked) => {
    render(<Switch checked={checked} onChange={() => {}} label="Windows open" />);
    const box = minBox(screen.getByRole('switch', { name: 'Windows open' }).className);
    expect(box.width).toBeGreaterThanOrEqual(MIN_TARGET);
    expect(box.height).toBeGreaterThanOrEqual(MIN_TARGET);
  });

  it('text inputs and selects are at least 24 pixels tall and fill their field', () => {
    expect(minBox(inputClass).height).toBeGreaterThanOrEqual(MIN_TARGET);
    expect(inputClass.split(/\s+/)).toContain('w-full');
  });
});
