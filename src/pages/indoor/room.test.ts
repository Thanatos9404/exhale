import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_HOUSEHOLD } from '@/lib/profile/schema';
import { EXHAUST_CAPTURE, PURIFIER_CADR, SOURCE_RATE, simulateRoom } from '@/lib/science/indoor';
import {
  PURIFIERS,
  SOURCES,
  cutPercent,
  indoorCategory,
  isPurifier,
  quickWins,
  roomFromHome,
  simulate,
  sourceRate,
  type Room,
  type SourceKey,
} from './room';

const { home } = DEFAULT_HOUSEHOLD;

/** A closed 45 m² room on a smoggy day with nothing burning and no purifier. */
const room = (patch: Partial<Room> = {}): Room => ({
  outdoor: 180,
  area: 45,
  ventilation: 'normal',
  windowsOpen: false,
  purifier: 'none',
  exhaust: false,
  sources: new Set(),
  ...patch,
});

const burning = (...keys: SourceKey[]) => new Set<SourceKey>(keys);
const winsFor = (r: Room) => quickWins(r, simulate(r).indoorPm25);
const labels = (r: Room) => winsFor(r).map((w) => w.label);

describe('lab options', () => {
  it('offers each smoke source once, with a positive emission rate', () => {
    expect(new Set(SOURCES.map((s) => s.key)).size).toBe(SOURCES.length);
    expect(new Set(SOURCES.map((s) => s.label)).size).toBe(SOURCES.length);
    for (const source of SOURCES) expect(source.rate).toBeGreaterThan(0);
  });

  it('offers every purifier the room model knows, labelled with its clean-air rate', () => {
    expect(PURIFIERS.map((p) => p.value).sort()).toEqual(Object.keys(PURIFIER_CADR).sort());
    expect(PURIFIERS[0]).toEqual({ value: 'none', label: 'None' });
    for (const { value, label } of PURIFIERS.slice(1)) {
      expect(label).toContain(`${PURIFIER_CADR[value]} m³/h`);
    }
  });

  it('recognises purifier values and nothing else', () => {
    for (const { value } of PURIFIERS) expect(isPurifier(value)).toBe(true);
    for (const value of ['', 'None', 'huge', 'small ', 'toString']) {
      expect(isPurifier(value)).toBe(false);
    }
  });
});

describe('roomFromHome', () => {
  it("describes the household home with windows shut and today's outdoor air", () => {
    const r = roomFromHome(home, 212);
    expect(r).toMatchObject({
      outdoor: 212,
      area: 45,
      ventilation: 'normal',
      windowsOpen: false,
      purifier: 'none',
      exhaust: false,
    });
    expect([...r.sources].sort()).toEqual(['coil', 'incense']);
  });

  it('lights only the sources the household uses', () => {
    const none = roomFromHome({ ...home, incense: false, mosquitoCoil: false }, 50);
    expect(none.sources.size).toBe(0);
    const coil = roomFromHome({ ...home, incense: false }, 50);
    expect([...coil.sources]).toEqual(['coil']);
  });

  it('carries over the purifier, hood, size and draughts', () => {
    const r = roomFromHome(
      { ...home, areaM2: 18, ventilation: 'leaky', purifier: 'diy', kitchenExhaust: true },
      90,
    );
    expect(r).toMatchObject({ area: 18, ventilation: 'leaky', purifier: 'diy', exhaust: true });
  });

  // Regression test for a bug fixed on 24 Nov 2026 (src/pages/indoor/room.ts:67-70): the profile's incense and mosquito-coil habits are
  // turned into lab sources, but `home.indoorSmoking` is ignored although the lab has a
  // "Cigarette indoors" source. A household that smokes indoors opens the lab with that source
  // switched off, so the room does not match "the room as the household profile describes it".
  it('lights the cigarette for a household that smokes indoors', () => {
    const r = roomFromHome({ ...home, indoorSmoking: true }, 100);
    expect(r.sources.has('cigarette')).toBe(true);
  });
});

describe('sourceRate', () => {
  it('is zero with nothing burning', () => {
    expect(sourceRate(room())).toBe(0);
  });

  it('adds up the sources that are on', () => {
    expect(sourceRate(room({ sources: burning('incense') }))).toBe(SOURCE_RATE.incense);
    expect(sourceRate(room({ sources: burning('incense', 'coil', 'candle') }))).toBe(
      SOURCE_RATE.incense + SOURCE_RATE.mosquitoCoil + SOURCE_RATE.candle,
    );
    const all = sourceRate(room({ sources: burning(...SOURCES.map((s) => s.key)) }));
    expect(all).toBe(SOURCES.reduce((sum, s) => sum + s.rate, 0));
  });

  it('lets the kitchen hood capture part of the frying smoke and nothing else', () => {
    const frying = sourceRate(room({ sources: burning('frying'), exhaust: true }));
    expect(frying).toBeCloseTo(SOURCE_RATE.fryingGas * (1 - EXHAUST_CAPTURE), 6);
    expect(sourceRate(room({ sources: burning('incense', 'cigarette'), exhaust: true }))).toBe(
      SOURCE_RATE.incense + SOURCE_RATE.cigarette,
    );
  });
});

describe('simulate', () => {
  it('runs the room model on this room, sources included', () => {
    const r = room({
      area: 30,
      ventilation: 'leaky',
      purifier: 'medium',
      sources: burning('coil'),
    });
    expect(simulate(r)).toEqual(
      simulateRoom({
        outdoorPm25: 180,
        areaM2: 30,
        ventilation: 'leaky',
        windowsOpen: false,
        purifier: 'medium',
        sourceUgPerHour: SOURCE_RATE.mosquitoCoil,
      }),
    );
  });

  it('responds to each control the way a room does', () => {
    const base = simulate(room()).indoorPm25;
    expect(simulate(room({ sources: burning('incense') })).indoorPm25).toBeGreaterThan(base);
    expect(simulate(room({ purifier: 'large' })).indoorPm25).toBeLessThan(base);
    expect(simulate(room({ windowsOpen: true })).indoorPm25).toBeGreaterThan(base);
    expect(simulate(room({ outdoor: 20 })).indoorPm25).toBeLessThan(base);
    expect(simulate(room({ outdoor: 0 })).indoorPm25).toBe(0);
  });
});

describe('indoorCategory', () => {
  it('names the AQI band of an indoor PM2.5 level in the chosen standard', () => {
    expect(indoorCategory(8, 'in')).toMatchObject({ level: 0, label: 'Good' });
    expect(indoorCategory(8, 'us')).toMatchObject({ level: 0, label: 'Good' });
    expect(indoorCategory(50, 'in')).toMatchObject({ level: 1, label: 'Satisfactory' });
    expect(indoorCategory(50, 'us')).toMatchObject({ level: 2 });
    expect(indoorCategory(5000, 'in')).toMatchObject({ level: 5, label: 'Severe' });
    expect(indoorCategory(5000, 'us')).toMatchObject({ level: 5, label: 'Hazardous' });
    expect(indoorCategory(0, 'in').level).toBe(0);
  });
});

describe('quickWins', () => {
  it('suggests removing the sources and adding a filter for the default home', () => {
    const r = roomFromHome(home, 180);
    const before = simulate(r).indoorPm25;
    const wins = quickWins(r, before);
    expect(wins.map((w) => w.label).sort()).toEqual([
      'Add a DIY box-fan filter',
      'Remove every indoor smoke source',
    ]);
    for (const win of wins) {
      expect(win.after).toBeLessThan(before);
      expect(simulate(win.next).indoorPm25).toBe(win.after);
    }
    expect(wins[0]!.after).toBeLessThanOrEqual(wins[1]!.after);
  });

  it('suggests shutting the windows only when the air outside is the problem', () => {
    expect(labels(room({ windowsOpen: true }))).toContain('Shut the windows');
    expect(labels(room())).not.toContain('Shut the windows');
    // Clean air outside and incense inside: open windows are helping.
    const airing = room({ outdoor: 5, windowsOpen: true, sources: burning('incense') });
    expect(labels(airing)).not.toContain('Shut the windows');
  });

  it('suggests the kitchen hood only while frying without it', () => {
    expect(labels(room({ sources: burning('frying') }))).toContain('Turn the kitchen hood on');
    expect(labels(room({ sources: burning('frying'), exhaust: true }))).not.toContain(
      'Turn the kitchen hood on',
    );
    expect(labels(room({ sources: burning('incense') }))).not.toContain('Turn the kitchen hood on');
  });

  it('suggests the next purifier step for the purifier in the room', () => {
    expect(labels(room())).toContain('Add a DIY box-fan filter');
    expect(labels(room({ purifier: 'small' }))).toContain('Upgrade to a large purifier');
    for (const purifier of ['medium', 'large', 'diy'] as const) {
      expect(labels(room({ purifier })).join(' ')).not.toMatch(/purifier|filter/);
    }
  });

  it('suggests draught-proofing a leaky home', () => {
    expect(labels(room({ ventilation: 'leaky' }))).toContain('Draught-proof doors and windows');
    expect(labels(room({ ventilation: 'sealed' }))).not.toContain(
      'Draught-proof doors and windows',
    );
  });

  it('lists nothing when no change is worth half a microgram', () => {
    expect(winsFor(room({ outdoor: 0 }))).toEqual([]);
    expect(winsFor(room({ outdoor: 0.5, ventilation: 'leaky' }))).toEqual([]);
  });

  it('changes a copy and leaves the room as it was', () => {
    const r = room({ windowsOpen: true, ventilation: 'leaky', sources: burning('frying', 'coil') });
    const wins = winsFor(r);
    expect(wins.length).toBeGreaterThanOrEqual(3);
    expect(r).toMatchObject({ windowsOpen: true, ventilation: 'leaky', purifier: 'none' });
    expect([...r.sources]).toEqual(['frying', 'coil']);
    for (const win of wins) expect(win.next).not.toBe(r);
  });

  it('only lists real gains, best first, each with the level it leaves', () => {
    const roomArb: fc.Arbitrary<Room> = fc.record({
      outdoor: fc.double({ min: 0, max: 1000, noNaN: true }),
      area: fc.double({ min: 5, max: 200, noNaN: true }),
      ventilation: fc.constantFrom('sealed', 'normal', 'leaky'),
      windowsOpen: fc.boolean(),
      purifier: fc.constantFrom(...PURIFIERS.map((p) => p.value)),
      exhaust: fc.boolean(),
      sources: fc.subarray(SOURCES.map((s) => s.key)).map((keys) => new Set(keys)),
    });
    fc.assert(
      fc.property(roomArb, (r) => {
        const before = simulate(r).indoorPm25;
        const wins = quickWins(r, before);
        expect(new Set(wins.map((w) => w.label)).size).toBe(wins.length);
        wins.forEach((win, i) => {
          expect(win.after).toBeLessThan(before - 0.5);
          expect(win.after).toBe(simulate(win.next).indoorPm25);
          expect(win.after).toBeGreaterThanOrEqual(wins[i - 1]?.after ?? 0);
        });
      }),
    );
  });
});

describe('cutPercent', () => {
  it('gives the percentage cut from before to after', () => {
    expect(cutPercent(200, 50)).toBe(75);
    expect(cutPercent(80, 80)).toBe(0);
    expect(cutPercent(80, 0)).toBe(100);
  });

  it('goes negative when the change makes things worse', () => {
    expect(cutPercent(50, 75)).toBe(-50);
  });

  it('stays finite on a baseline of zero or nearly zero', () => {
    expect(cutPercent(0, 0)).toBe(0);
    expect(cutPercent(0.5, 0)).toBe(50);
    expect(Number.isFinite(cutPercent(0, 3))).toBe(true);
  });

  it('never reports more than a 100% cut for levels that cannot be negative', () => {
    const level = fc.double({ min: 0, max: 5000, noNaN: true });
    fc.assert(
      fc.property(level, level, (before, after) => {
        const cut = cutPercent(before, after);
        expect(Number.isFinite(cut)).toBe(true);
        expect(cut).toBeLessThanOrEqual(100);
        expect(Math.sign(cut)).toBe(Math.sign(before - after));
      }),
    );
  });
});
