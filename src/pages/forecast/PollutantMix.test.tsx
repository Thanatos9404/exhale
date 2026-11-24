import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { makeHourly } from '@/test/fixtures';
import { axeViolations } from '@/test/render';
import { PollutantMix } from './PollutantMix';

const now = makeHourly(1)[0]!;

/** The text a sighted user reads on a legend button: everything not hidden from view. */
function visibleText(button: HTMLElement): string[] {
  return [...button.querySelectorAll<HTMLElement>(':scope > span:not(.sr-only)')]
    .map((span) => span.textContent.trim())
    .filter((text) => text !== '');
}

describe('PollutantMix legend', () => {
  it('names each button with the text it shows (WCAG 2.5.3, label in name)', () => {
    render(<PollutantMix now={now} />);
    const buttons = within(screen.getByRole('list')).getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(1);

    for (const button of buttons) {
      const [label, reading] = visibleText(button);
      expect(label).toBeTruthy();
      expect(reading).toMatch(/µg\/m³ · [\d.]+×$/);
      // The name starts with the visible words, in the order they are shown.
      expect(button).toHaveAccessibleName(expect.stringMatching(/^\S/));
      expect(button).toHaveAccessibleName(expect.stringContaining(`${label} ${reading}`));
      expect(button.getAttribute('aria-label')).toBeNull();
    }
  });

  it('still spells out the units and the comparison for screen readers', () => {
    render(<PollutantMix now={now} />);
    const pm25 = screen.getByRole('button', { name: /^PM2\.5 170 µg\/m³/ });
    expect(pm25).toHaveAccessibleName(
      expect.stringMatching(/170 micrograms per cubic metre, [\d.]+ times the WHO guideline$/),
    );
  });

  it('has no axe violations', async () => {
    const { container } = render(<PollutantMix now={now} />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
