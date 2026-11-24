import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { aqiSeries, hourlyAqi } from '@/lib/air/aqi';
import { DEFAULT_HOUSEHOLD } from '@/lib/profile/schema';
import { makeSnapshot } from '@/test/fixtures';
import {
  ManualIntersectionObserver,
  installManualIntersectionObserver,
  setSaveData,
  stubMatchMedia,
} from '@/test/observers';
import { axeViolations } from '@/test/render';
import { posterDotCount, posterLidY } from './AirColumnPoster';
import { AirColumnPreview } from './AirColumnPreview';
import { scrubHour } from './scrub';

// The real scene needs WebGL and three.js; a marker is enough to see when it mounts.
vi.mock('@/components/three/AirColumn', () => ({
  default: () => <div data-testid="scene-3d" />,
}));

const { standard } = DEFAULT_HOUSEHOLD;
const air = makeSnapshot();
const scrub = scrubHour(
  air,
  {
    official: aqiSeries(air.hourly, standard),
    instant: air.hourly.map((h) => hourlyAqi(h, standard)),
  },
  0,
  standard,
)!;

/** The fixture's current hour: a 30 m lid over 170 µg/m³ of PM2.5. */
const FACTS = 'Lid 30 m · PM2.5 170 µg/m³';

/** Puts the preview on screen and lets the browser go idle. */
function becomeVisibleAndIdle() {
  act(() => {
    ManualIntersectionObserver.current?.emit(true);
  });
  act(() => {
    vi.advanceTimersByTime(3000);
  });
}

let restoreObserver = () => {};

beforeEach(() => {
  vi.useFakeTimers();
  restoreObserver = installManualIntersectionObserver();
});

afterEach(() => {
  vi.useRealTimers();
  restoreObserver();
  setSaveData(false);
});

describe('AirColumnPreview', () => {
  it('shows a poster with the same facts until it is on screen and the browser is idle', async () => {
    render(<AirColumnPreview scrub={scrub} webgl />);
    expect(screen.getByText(FACTS)).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /lid at 30 metres, PM2\.5 170 micrograms/ }),
    ).toBeVisible();
    expect(screen.queryByTestId('scene-3d')).not.toBeInTheDocument();
    // Nothing to press: the scene is on its way without being asked for.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.queryByTestId('scene-3d')).not.toBeInTheDocument();

    becomeVisibleAndIdle();
    vi.useRealTimers();
    expect(await screen.findByTestId('scene-3d')).toBeInTheDocument();
    expect(screen.queryByText(FACTS)).not.toBeInTheDocument();
  });

  it('keeps data-saver users on the poster, however long it is on screen', () => {
    setSaveData(true);
    render(<AirColumnPreview scrub={scrub} webgl />);
    becomeVisibleAndIdle();
    expect(ManualIntersectionObserver.instances).toHaveLength(0);
    expect(screen.queryByTestId('scene-3d')).not.toBeInTheDocument();
    expect(screen.getByText(FACTS)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show 3D view' })).toBeEnabled();
  });

  it('treats a prefers-reduced-data preference like the data saver', () => {
    const restore = stubMatchMedia((query) => query.includes('prefers-reduced-data'));
    render(<AirColumnPreview scrub={scrub} webgl />);
    becomeVisibleAndIdle();
    expect(screen.queryByTestId('scene-3d')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show 3D view' })).toBeInTheDocument();
    restore();
  });

  it('loads the scene on demand from "Show 3D view" and keeps focus on the view', async () => {
    setSaveData(true);
    vi.useRealTimers();
    render(<AirColumnPreview scrub={scrub} webgl />);
    fireEvent.click(screen.getByRole('button', { name: 'Show 3D view' }));

    expect(await screen.findByTestId('scene-3d')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show 3D view' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Air column' })).toHaveFocus();
  });

  it('draws the poster inside the frame the scene will fill, so nothing shifts', () => {
    setSaveData(true);
    render(<AirColumnPreview scrub={scrub} webgl />);
    const frame = screen.getByRole('group', { name: 'Air column' });
    expect(frame).toHaveClass('relative', 'aspect-[16/11]');
    const poster = screen.getByRole('img').parentElement!;
    expect(poster.parentElement).toBe(frame);
    expect(poster).toHaveClass('absolute', 'inset-0');
  });

  it('has no axe violations as a poster', async () => {
    setSaveData(true);
    vi.useRealTimers();
    const { container } = render(<AirColumnPreview scrub={scrub} webgl />);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('keeps the text fallback where WebGL is missing', () => {
    render(<AirColumnPreview scrub={scrub} webgl={false} />);
    becomeVisibleAndIdle();
    expect(
      screen.getByText('3D view needs WebGL. Mixing height 30 m, PM2.5 170 µg/m³.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('scene-3d')).not.toBeInTheDocument();
  });
});

describe('poster sketch', () => {
  it('draws a lower lid closer to the ground', () => {
    expect(posterLidY(30)).toBeGreaterThan(posterLidY(1200));
    expect(posterLidY(1500)).toBe(posterLidY(4000));
  });

  it('draws more dots for more PM2.5, within fixed bounds', () => {
    expect(posterDotCount(170)).toBeGreaterThan(posterDotCount(40));
    expect(posterDotCount(0)).toBeGreaterThan(0);
    expect(posterDotCount(900)).toBe(posterDotCount(220));
  });
});
