import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  AIR_EXCHANGE,
  PURIFIER_CADR,
  infiltrationRatio,
  simulateRoom,
  sourceIncrement,
  type Purifier,
  type RoomInput,
  type Ventilation,
} from './indoor';

/** Property tests for the single-zone indoor mass balance. */

const RUNS = { numRuns: 200 };
const VENTILATIONS: readonly Ventilation[] = ['sealed', 'normal', 'leaky'];
const PURIFIERS: readonly Purifier[] = ['none', 'small', 'medium', 'large', 'diy'];

const ventilationArb = fc.constantFrom(...VENTILATIONS);
const purifierArb = fc.constantFrom(...PURIFIERS);
/** Any home the profile allows (5 to 200 m²) under any smog and any indoor source. */
const roomArb: fc.Arbitrary<Required<RoomInput>> = fc.record({
  outdoorPm25: fc.double({ min: 0, max: 2000, noNaN: true }),
  areaM2: fc.double({ min: 5, max: 200, noNaN: true }),
  ventilation: ventilationArb,
  windowsOpen: fc.boolean(),
  purifier: purifierArb,
  sourceUgPerHour: fc.double({ min: 0, max: 500_000, noNaN: true }),
});

/** Equal up to floating-point noise, relative to the size of the numbers. */
function expectClose(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(
    1e-9 * Math.max(1, Math.abs(actual), Math.abs(expected)),
  );
}

describe('simulateRoom properties', () => {
  it('never raises indoor PM2.5 when the purifier delivers more clean air', () => {
    fc.assert(
      fc.property(roomArb, purifierArb, (room, other) => {
        const [weaker, stronger] =
          PURIFIER_CADR[room.purifier] <= PURIFIER_CADR[other]
            ? [room.purifier, other]
            : [other, room.purifier];
        const withWeaker = simulateRoom({ ...room, purifier: weaker });
        const withStronger = simulateRoom({ ...room, purifier: stronger });
        expect(withStronger.indoorPm25).toBeLessThanOrEqual(withWeaker.indoorPm25);
        expect(withStronger.timeConstantMin).toBeLessThanOrEqual(withWeaker.timeConstantMin);
        expect(withStronger.purifierAch).toBeGreaterThanOrEqual(withWeaker.purifierAch);
      }),
      RUNS,
    );
  });

  it('never lowers indoor PM2.5 when an indoor source gets stronger', () => {
    fc.assert(
      fc.property(roomArb, fc.double({ min: 0, max: 500_000, noNaN: true }), (room, extra) => {
        const more = { ...room, sourceUgPerHour: room.sourceUgPerHour + extra };
        expect(simulateRoom(more).indoorPm25).toBeGreaterThanOrEqual(simulateRoom(room).indoorPm25);
      }),
      RUNS,
    );
  });

  it('never lowers indoor PM2.5 when the air outside gets dirtier', () => {
    fc.assert(
      fc.property(roomArb, fc.double({ min: 0, max: 2000, noNaN: true }), (room, extra) => {
        const dirtier = { ...room, outdoorPm25: room.outdoorPm25 + extra };
        expect(simulateRoom(dirtier).indoorPm25).toBeGreaterThanOrEqual(
          simulateRoom(room).indoorPm25,
        );
      }),
      RUNS,
    );
  });

  it('stays finite and non-negative for extreme but valid rooms', () => {
    const extremeRoom = fc.record({
      // A dust storm, a cupboard-sized room that the model clamps to 5 m², a bonfire indoors.
      // Outdoor air is either exactly clean or at least 0.01 µg/m³: the indoor/outdoor ratio of
      // a home with a source grows without bound as the outdoor level vanishes.
      outdoorPm25: fc.oneof(fc.constant(0), fc.double({ min: 0.01, max: 1e6, noNaN: true })),
      areaM2: fc.double({ min: 0, max: 1e6, noNaN: true }),
      ventilation: ventilationArb,
      windowsOpen: fc.boolean(),
      purifier: purifierArb,
      sourceUgPerHour: fc.double({ min: 0, max: 1e9, noNaN: true }),
    });
    fc.assert(
      fc.property(extremeRoom, (room) => {
        const result = simulateRoom(room);
        for (const value of Object.values(result)) {
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
        }
        expect(result.volumeM3).toBeGreaterThanOrEqual(5 * 2.8);
        expect(result.timeConstantMin).toBeGreaterThan(0);
      }),
      RUNS,
    );
  });

  it('treats negative outdoor readings and sources as zero', () => {
    fc.assert(
      fc.property(
        roomArb,
        fc.double({ min: -1e6, max: 0, noNaN: true }),
        fc.double({ min: -1e6, max: 0, noNaN: true }),
        (room, outdoorPm25, sourceUgPerHour) => {
          const result = simulateRoom({ ...room, outdoorPm25, sourceUgPerHour });
          expect(result.indoorPm25).toBe(0);
          expect(result.ratio).toBe(0);
        },
      ),
      RUNS,
    );
  });

  it('keeps a closed home without sources cleaner than the street', () => {
    fc.assert(
      fc.property(roomArb, (room) => {
        const result = simulateRoom({ ...room, windowsOpen: false, sourceUgPerHour: 0 });
        expect(result.indoorPm25).toBeLessThanOrEqual(room.outdoorPm25);
        expect(result.ratio).toBeLessThanOrEqual(1);
      }),
      RUNS,
    );
  });

  it('is the sum of what leaks in and what the indoor source adds', () => {
    fc.assert(
      fc.property(roomArb, (room) => {
        const closed = { ...room, windowsOpen: false };
        const leaked =
          infiltrationRatio(room.ventilation, room.purifier, room.areaM2) * room.outdoorPm25;
        const added = sourceIncrement(
          room.sourceUgPerHour,
          room.ventilation,
          room.purifier,
          room.areaM2,
        );
        expectClose(simulateRoom(closed).indoorPm25, leaked + added);
      }),
      RUNS,
    );
  });

  it('scales with the outdoor level when there is no indoor source', () => {
    fc.assert(
      fc.property(roomArb, fc.double({ min: 0, max: 50, noNaN: true }), (room, factor) => {
        const clean = { ...room, sourceUgPerHour: 0 };
        const scaled = simulateRoom({ ...clean, outdoorPm25: room.outdoorPm25 * factor });
        expectClose(scaled.indoorPm25, simulateRoom(clean).indoorPm25 * factor);
      }),
      RUNS,
    );
  });
});

describe('infiltration and source helpers', () => {
  it('lets in less outdoor air the tighter the home, with or without a purifier', () => {
    fc.assert(
      fc.property(
        purifierArb,
        fc.double({ min: 5, max: 200, noNaN: true }),
        ventilationArb,
        ventilationArb,
        (purifier, areaM2, a, b) => {
          const [tighter, leakier] = AIR_EXCHANGE[a] <= AIR_EXCHANGE[b] ? [a, b] : [b, a];
          expect(infiltrationRatio(tighter, purifier, areaM2)).toBeLessThanOrEqual(
            infiltrationRatio(leakier, purifier, areaM2),
          );
        },
      ),
      RUNS,
    );
  });

  it('dilutes the same source more in a bigger room', () => {
    fc.assert(
      fc.property(
        roomArb,
        fc.double({ min: 0, max: 200, noNaN: true }),
        ({ sourceUgPerHour, ventilation, areaM2 }, extraArea) => {
          // Without a purifier the loss rate does not depend on the room's size.
          const small = sourceIncrement(sourceUgPerHour, ventilation, 'none', areaM2);
          const large = sourceIncrement(sourceUgPerHour, ventilation, 'none', areaM2 + extraArea);
          expect(large).toBeLessThanOrEqual(small);
        },
      ),
      RUNS,
    );
  });
});
