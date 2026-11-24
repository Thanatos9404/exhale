import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  PAD,
  buildGeometry,
  cursorForKey,
  labelStep,
  readout,
  type ChartPoint,
  type Threshold,
} from './geometry';

const WIDTH = 640;
const HEIGHT = 240;
/** Pixel bounds of the plot area for the default size. */
const LEFT = PAD.left;
const RIGHT = WIDTH - PAD.right;
const TOP = PAD.top;
const BOTTOM = HEIGHT - PAD.bottom;

const points = (values: (number | null)[]): ChartPoint[] =>
  values.map((value, i) => ({ label: `h${i}`, value }));

const geometryOf = (values: (number | null)[], thresholds: Threshold[] = []) =>
  buildGeometry({ data: points(values), thresholds, width: WIDTH, height: HEIGHT });

/** Every coordinate pair an SVG path visits, control points included. */
function coordinates(path: string): { x: number; y: number }[] {
  const numbers = (path.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi) ?? []).map(Number);
  const pairs: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2)
    pairs.push({ x: numbers[i]!, y: numbers[i + 1]! });
  return pairs;
}

/** How many separate strokes a path holds. */
const strokes = (path: string) => (path.match(/M/g) ?? []).length;

describe('buildGeometry scales', () => {
  it('spreads the hours across the plot area, first on the left edge and last on the right', () => {
    const g = geometryOf([10, 20, 30, 40, 50]);
    expect(g.x(0)).toBe(LEFT);
    expect(g.x(4)).toBe(RIGHT);
    expect(g.x(2)).toBeCloseTo((LEFT + RIGHT) / 2, 9);
    expect(g).toMatchObject({ width: WIDTH, height: HEIGHT });
  });

  it('puts zero on the baseline and larger values higher up', () => {
    const g = geometryOf([0, 50, 100]);
    expect(g.y(0)).toBe(BOTTOM);
    expect(g.y(50)).toBeLessThan(g.y(0));
    expect(g.y(100)).toBeLessThan(g.y(50));
    expect(g.y(100)).toBeGreaterThanOrEqual(TOP);
  });

  it('leaves headroom above the highest value', () => {
    const g = geometryOf([40, 250, 90]);
    expect(g.maxV).toBeCloseTo(250 * 1.12, 9);
    expect(g.y(250)).toBeGreaterThan(TOP);
    expect(g.y.domain()[1]).toBeGreaterThanOrEqual(g.maxV);
  });

  it('makes room for a threshold above every reading', () => {
    const g = geometryOf([12, 18, 9], [{ value: 60, label: 'India 24 h standard' }]);
    expect(g.maxV).toBeCloseTo(60 * 1.12, 9);
    expect(g.y(60)).toBeGreaterThanOrEqual(TOP);
    expect(g.y(60)).toBeLessThan(g.y(18));
  });

  it('never zooms in closer than a 10-unit axis, so tiny readings stay near the baseline', () => {
    const g = geometryOf([0.2, 0.4, 0.1]);
    expect(g.maxV).toBeCloseTo(11.2, 9);
    expect(BOTTOM - g.y(0.4)).toBeLessThan((BOTTOM - TOP) * 0.05);
  });

  it('offers a few round ticks, ascending from zero and inside the axis', () => {
    const g = geometryOf([40, 250, 90]);
    const [lo, hi] = g.y.domain();
    expect(g.ticks[0]).toBe(0);
    expect(g.ticks.length).toBeGreaterThanOrEqual(2);
    expect(g.ticks.length).toBeLessThanOrEqual(7);
    expect([...g.ticks].sort((a, b) => a - b)).toEqual(g.ticks);
    for (const tick of g.ticks) {
      expect(tick).toBeGreaterThanOrEqual(lo!);
      expect(tick).toBeLessThanOrEqual(hi!);
    }
  });
});

describe('buildGeometry paths', () => {
  it('draws the line through the first and last reading', () => {
    const g = geometryOf([30, 80, 55, 120]);
    const visited = coordinates(g.path);
    expect(strokes(g.path)).toBe(1);
    expect(visited[0]!.x).toBeCloseTo(g.x(0), 2);
    expect(visited[0]!.y).toBeCloseTo(g.y(30), 2);
    expect(visited.at(-1)!.x).toBeCloseTo(g.x(3), 2);
    expect(visited.at(-1)!.y).toBeCloseTo(g.y(120), 2);
  });

  it('closes the area down to the baseline', () => {
    const g = geometryOf([30, 80, 55, 120]);
    const ys = coordinates(g.fill).map((p) => p.y);
    expect(g.fill.endsWith('Z')).toBe(true);
    expect(Math.max(...ys)).toBe(BOTTOM);
    expect(Math.min(...ys)).toBeCloseTo(g.y(120), 2);
  });

  it('breaks the line at a gap instead of drawing through it', () => {
    const g = geometryOf([30, 40, null, null, 70, 80, 90]);
    expect(strokes(g.path)).toBe(2);
    expect(strokes(g.fill)).toBe(2);
    // Nothing is drawn at the baseline for the missing hours.
    const gapXs = [g.x(2), g.x(3)];
    for (const p of coordinates(g.path)) expect(gapXs).not.toContain(p.x);
  });

  it('draws nothing for an empty series or one with no readings', () => {
    for (const g of [geometryOf([]), geometryOf([null, null, null])]) {
      expect(g.path).toBe('');
      expect(g.fill).toBe('');
      expect(g.maxV).toBeCloseTo(11.2, 9);
      expect(g.ticks.length).toBeGreaterThan(0);
    }
  });

  it('places a single hour on the left edge without dividing by zero', () => {
    const g = geometryOf([75]);
    expect(g.x(0)).toBe(LEFT);
    const visited = coordinates(g.path);
    expect(visited).toHaveLength(1);
    expect(visited[0]!.x).toBe(LEFT);
    expect(visited[0]!.y).toBeCloseTo(g.y(75), 2);
    expect(g.path).not.toMatch(/NaN|Infinity/);
  });

  it('survives a zero-size chart with finite numbers', () => {
    const g = buildGeometry({
      data: points([10, 200, null, 90]),
      thresholds: [{ value: 100, label: 'limit' }],
      width: 0,
      height: 0,
    });
    expect(`${g.path} ${g.fill}`).not.toMatch(/NaN|Infinity/);
    expect(g.path).not.toBe('');
    for (const value of [g.x(0), g.x(3), g.y(0), g.y(200), ...g.ticks]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('keeps extreme readings on the chart', () => {
    const g = geometryOf([0, 1e12, 5, 999_999]);
    expect(`${g.path} ${g.fill}`).not.toMatch(/NaN|Infinity/);
    expect(g.y(1e12)).toBeGreaterThanOrEqual(TOP);
    expect(g.y(1e12)).toBeLessThan(BOTTOM);
    expect(g.maxV).toBeGreaterThan(1e12);
  });
});

describe('buildGeometry invariants', () => {
  const reading = fc.option(fc.double({ min: 0, max: 5000, noNaN: true }), { nil: null, freq: 6 });
  const input = fc.record({
    values: fc.array(reading, { maxLength: 120 }),
    limits: fc.array(fc.double({ min: 0, max: 5000, noNaN: true }), { maxLength: 3 }),
    width: fc.integer({ min: 120, max: 2400 }),
    height: fc.integer({ min: 80, max: 900 }),
  });
  /** Slack for the three decimals a path is written with, in pixels. */
  const EPS = 1e-3;

  it('maps the data range into the pixel range, whatever the series and size', () => {
    fc.assert(
      fc.property(input, ({ values, limits, width, height }) => {
        const thresholds = limits.map((value) => ({ value, label: 'limit' }));
        const g = buildGeometry({ data: points(values), thresholds, width, height });
        const bottom = height - PAD.bottom;
        expect(g.x(0)).toBe(PAD.left);
        if (values.length > 1) expect(g.x(values.length - 1)).toBeCloseTo(width - PAD.right, 6);
        expect(g.y(0)).toBe(bottom);
        for (const value of [...values.filter((v) => v != null), ...limits]) {
          expect(value).toBeLessThanOrEqual(g.maxV);
          expect(g.y(value)).toBeGreaterThanOrEqual(PAD.top - EPS);
          expect(g.y(value)).toBeLessThanOrEqual(bottom + EPS);
        }
        for (const p of [...coordinates(g.path), ...coordinates(g.fill)]) {
          expect(p.x).toBeGreaterThanOrEqual(PAD.left - EPS);
          expect(p.x).toBeLessThanOrEqual(width - PAD.right + EPS);
          expect(p.y).toBeGreaterThanOrEqual(PAD.top - EPS);
          expect(p.y).toBeLessThanOrEqual(bottom + EPS);
        }
      }),
    );
  });

  it('is monotonic: later hours sit further right and larger values sit higher', () => {
    fc.assert(
      fc.property(
        input,
        fc.double({ min: 0, max: 5000, noNaN: true }),
        fc.double({ min: 0, max: 5000, noNaN: true }),
        ({ values, limits, width, height }, a, b) => {
          const thresholds = limits.map((value) => ({ value, label: 'limit' }));
          const g = buildGeometry({ data: points(values), thresholds, width, height });
          for (let i = 1; i < values.length; i++) expect(g.x(i)).toBeGreaterThan(g.x(i - 1));
          const [low, high] = a <= b ? [a, b] : [b, a];
          expect(g.y(high)).toBeLessThanOrEqual(g.y(low));
          if (high - low > 1) expect(g.y(high)).toBeLessThan(g.y(low));
        },
      ),
    );
  });

  it('draws one stroke per unbroken run of readings', () => {
    fc.assert(
      fc.property(fc.array(reading, { maxLength: 60 }), (values) => {
        const runs = values.filter((v, i) => v != null && values[i - 1] == null).length;
        const g = geometryOf(values);
        expect(strokes(g.path)).toBe(runs);
        expect(strokes(g.fill)).toBe(runs);
      }),
    );
  });
});

describe('labelStep', () => {
  it('labels every point when they all fit', () => {
    expect(labelStep(6, 900)).toBe(1);
    expect(labelStep(3, 200)).toBe(1);
    expect(labelStep(1, 640)).toBe(1);
  });

  it('skips points when the chart is too narrow for all of them', () => {
    // 900 px has room for ten labels of about 90 px.
    expect(labelStep(60, 900)).toBe(6);
    expect(labelStep(84, 900)).toBe(8);
    // A phone-width chart still shows at least three labels.
    expect(labelStep(36, 320)).toBe(12);
  });

  it('copes with an empty series and a zero-width chart', () => {
    expect(labelStep(0, 640)).toBe(1);
    expect(labelStep(0, 0)).toBe(1);
    expect(labelStep(36, 0)).toBe(12);
  });

  it('is a whole step of at least one that keeps labels about 90 px apart', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 0, max: 4000 }),
        (count, width) => {
          const step = labelStep(count, width);
          const slots = Math.max(3, Math.floor(width / 90));
          expect(Number.isInteger(step)).toBe(true);
          expect(step).toBeGreaterThanOrEqual(1);
          expect(Math.ceil(count / step)).toBeLessThanOrEqual(2 * slots);
        },
      ),
    );
  });

  it('never needs a bigger step on a wider chart', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 0, max: 4000 }),
        fc.integer({ min: 0, max: 4000 }),
        (count, a, b) => {
          const [narrow, wide] = a <= b ? [a, b] : [b, a];
          expect(labelStep(count, wide)).toBeLessThanOrEqual(labelStep(count, narrow));
        },
      ),
    );
  });
});

describe('cursorForKey', () => {
  it('steps one point at a time with the arrow keys', () => {
    expect(cursorForKey('ArrowRight', 3, 10)).toBe(4);
    expect(cursorForKey('ArrowLeft', 3, 10)).toBe(2);
  });

  it('stops at the first and last point', () => {
    expect(cursorForKey('ArrowLeft', 0, 10)).toBe(0);
    expect(cursorForKey('ArrowRight', 10, 10)).toBe(10);
  });

  it('jumps to either end with Home and End', () => {
    expect(cursorForKey('Home', 7, 10)).toBe(0);
    expect(cursorForKey('End', 7, 10)).toBe(10);
  });

  it('clears the crosshair on Escape', () => {
    expect(cursorForKey('Escape', 4, 10)).toBeNull();
  });

  it('leaves every other key alone', () => {
    for (const key of ['Tab', 'Enter', ' ', 'a', 'ArrowUp', 'ArrowDown', 'PageDown', '']) {
      expect(cursorForKey(key, 4, 10)).toBeUndefined();
    }
  });

  it('stays put on a single-point chart', () => {
    expect(cursorForKey('ArrowRight', 0, 0)).toBe(0);
    expect(cursorForKey('ArrowLeft', 0, 0)).toBe(0);
    expect(cursorForKey('End', 0, 0)).toBe(0);
  });

  it('never moves the crosshair off the series', () => {
    const position = fc
      .integer({ min: 0, max: 400 })
      .chain((last) => fc.tuple(fc.integer({ min: 0, max: last }), fc.constant(last)));
    fc.assert(
      fc.property(
        fc.constantFrom('ArrowRight', 'ArrowLeft', 'Home', 'End'),
        position,
        (key, [cur, last]) => {
          const next = cursorForKey(key, cur, last);
          expect(next).toBeGreaterThanOrEqual(0);
          expect(next).toBeLessThanOrEqual(last);
          expect(Math.abs(next! - cur) <= 1 || next === 0 || next === last).toBe(true);
        },
      ),
    );
  });
});

describe('readout', () => {
  const format = (v: number) => v.toFixed(1);

  it('formats the value and adds the unit', () => {
    expect(readout({ label: '06:00', value: 182.44 }, 'µg/m³', format, 'No reading')).toBe(
      '182.4 µg/m³',
    );
  });

  it('reads zero as a value, not as a gap', () => {
    expect(readout({ label: '06:00', value: 0 }, 'µg/m³', format, 'No reading')).toBe('0.0 µg/m³');
  });

  it('uses the missing text for a gap, without calling the formatter', () => {
    const neverCalled = () => {
      throw new Error('formatter called for a gap');
    };
    expect(readout({ label: '06:00', value: null }, 'µg/m³', neverCalled, 'No reading')).toBe(
      'No reading',
    );
  });
});
