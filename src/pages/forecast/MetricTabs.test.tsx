import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { hourlyAqi } from '@/lib/air/aqi';
import { makeSnapshot } from '@/test/fixtures';
import { axeViolations } from '@/test/render';
import { METRIC_PANEL_ID, MetricTabs, metricTabId } from './MetricTabs';
import type { Metric } from './metrics';

/** The Forecast metric tabs as a WAI-ARIA tablist: roles, one Tab stop, arrows that select. */

const air = makeSnapshot();
const instantAqi = air.hourly.map((hour) => hourlyAqi(hour, 'in'));

/** The tabs with their state, optionally wired to a tab panel as the Forecast page wires them. */
function Harness({ withPanel = false }: { withPanel?: boolean }) {
  const [metric, setMetric] = useState<Metric>('aqi');
  return (
    <>
      <button type="button">Before</button>
      <MetricTabs
        metric={metric}
        onSelect={setMetric}
        air={air}
        instantAqi={instantAqi}
        panelId={withPanel ? METRIC_PANEL_ID : undefined}
      />
      {withPanel && (
        <div role="tabpanel" id={METRIC_PANEL_ID} aria-labelledby={metricTabId(metric)}>
          Chart
        </div>
      )}
      <button type="button">After</button>
    </>
  );
}

const tabs = () => screen.getAllByRole('tab');
const tab = (name: RegExp) => screen.getByRole('tab', { name });
const selected = () => tabs().filter((t) => t.getAttribute('aria-selected') === 'true');

describe('MetricTabs', () => {
  it('is a labelled tablist of five tabs with exactly one selected', () => {
    render(<Harness />);
    expect(screen.getByRole('tablist', { name: 'Metric' })).toBeInTheDocument();
    expect(tabs()).toHaveLength(5);
    expect(selected()).toEqual([tab(/^AQI/)]);
    expect(tabs().every((t) => t.getAttribute('aria-selected') !== null)).toBe(true);
  });

  it('is a single Tab stop on the selected tab', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(tabs().map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1', '-1']);
    await user.tab();
    await user.tab();
    expect(tab(/^AQI/)).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(tab(/^AQI/)).toHaveFocus();
  });

  it('moves and selects with Right and Left: aria-selected follows focus', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    tab(/^AQI/).focus();

    await user.keyboard('{ArrowRight}');
    expect(tab(/^PM2\.5/)).toHaveFocus();
    expect(selected()).toEqual([tab(/^PM2\.5/)]);
    expect(tabs().map((t) => t.getAttribute('tabindex'))).toEqual(['-1', '0', '-1', '-1', '-1']);

    await user.keyboard('{ArrowLeft}');
    expect(tab(/^AQI/)).toHaveFocus();
    expect(selected()).toEqual([tab(/^AQI/)]);
  });

  it('wraps from the first tab to the last and back', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    tab(/^AQI/).focus();
    await user.keyboard('{ArrowLeft}');
    expect(tab(/^O₃/)).toHaveFocus();
    expect(selected()).toEqual([tab(/^O₃/)]);
    await user.keyboard('{ArrowRight}');
    expect(tab(/^AQI/)).toHaveFocus();
    expect(selected()).toEqual([tab(/^AQI/)]);
  });

  it('jumps to the ends with End and Home', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    tab(/^AQI/).focus();
    await user.keyboard('{End}');
    expect(tab(/^O₃/)).toHaveFocus();
    expect(selected()).toEqual([tab(/^O₃/)]);
    await user.keyboard('{Home}');
    expect(tab(/^AQI/)).toHaveFocus();
    expect(selected()).toEqual([tab(/^AQI/)]);
  });

  it('leaves Up and Down to the page: a horizontal tablist does not take them', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    tab(/^AQI/).focus();
    await user.keyboard('{ArrowDown}{ArrowUp}');
    expect(tab(/^AQI/)).toHaveFocus();
    expect(selected()).toEqual([tab(/^AQI/)]);
  });

  it('still selects with a click', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(tab(/^PM10/));
    expect(selected()).toEqual([tab(/^PM10/)]);
  });

  it('points every tab at the panel only when the panel id is passed', () => {
    const { unmount } = render(<Harness />);
    expect(tabs().every((t) => !t.hasAttribute('aria-controls'))).toBe(true);
    unmount();

    render(<Harness withPanel />);
    const panel = screen.getByRole('tabpanel');
    expect(tabs().every((t) => t.getAttribute('aria-controls') === panel.id)).toBe(true);
    expect(panel).toHaveAccessibleName(/^AQI/);
  });

  it('names the panel after the tab the arrows selected', async () => {
    const user = userEvent.setup();
    render(<Harness withPanel />);
    tab(/^AQI/).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', metricTabId('pm25'));
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName(/^PM2\.5/);
  });

  it('has no axe violations, with or without the panel', async () => {
    const plain = render(<Harness />);
    expect(await axeViolations(plain.container)).toEqual([]);
    plain.unmount();
    const wired = render(<Harness withPanel />);
    expect(await axeViolations(wired.container)).toEqual([]);
  });

  it('gives every tab a target of at least 44 CSS pixels in height', () => {
    render(<Harness />);
    expect(tabs().every((t) => t.className.split(/\s+/).includes('min-h-11'))).toBe(true);
  });
});
