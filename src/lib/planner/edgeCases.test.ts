import { describe, expect, it } from 'vitest';
import type { HourPoint } from '@/lib/air/types';
import { DEFAULT_HOUSEHOLD, parseHousehold, type Household } from '@/lib/profile/schema';
import { makeHourly, makeSnapshot } from '@/test/fixtures';
import { buildPlan } from './engine';
import { planResultSchema } from './planSchema';

const NOW = new Date('2026-11-23T00:00:00Z');

function household(edit: (hh: Household) => void): Household {
  const hh = structuredClone(DEFAULT_HOUSEHOLD);
  edit(hh);
  return hh;
}

/** The fixture's winter day with some fields of every hour replaced. */
const hourlyWith = (patch: Partial<HourPoint>): HourPoint[] =>
  makeHourly().map((h) => ({ ...h, ...patch }));

const ids = (plan: ReturnType<typeof buildPlan>) => plan.items.map((i) => i.id);

describe('buildPlan with thin or missing air data', () => {
  it('fails loudly on an empty hourly series instead of inventing a plan', () => {
    const empty = makeSnapshot({ hourly: [], nowIndex: 0 });
    expect(() => buildPlan(DEFAULT_HOUSEHOLD, empty, NOW)).toThrow(/hourly\[0\]/);
  });

  it('plans from a single hour of data', () => {
    const oneHour = makeSnapshot({ hourly: makeHourly().slice(32, 33), nowIndex: 0 });
    const plan = buildPlan(DEFAULT_HOUSEHOLD, oneHour, NOW);
    expect(plan.horizon).toEqual({ start: '08:00', end: '09:00' });
    expect(plan.members).toHaveLength(3);
    expect(plan.totals.baselineDoseUg).toBeGreaterThan(0);
    expect(planResultSchema.safeParse(plan).success).toBe(true);
  });

  it('shortens the horizon when "now" is the last hour of the forecast', () => {
    const hourly = makeHourly(2);
    const plan = buildPlan(DEFAULT_HOUSEHOLD, makeSnapshot({ hourly, nowIndex: 47 }), NOW);
    expect(plan.horizon).toEqual({ start: '23:00', end: '00:00' });
    expect(plan.worstWindow).toBeNull();
    expect(plan.lid.stagnantHours).toBe(1);
  });

  it('reports no smog lid and no dispersion when boundary-layer data is missing', () => {
    const air = makeSnapshot({ hourly: hourlyWith({ blh: null }) });
    const plan = buildPlan(DEFAULT_HOUSEHOLD, air, NOW);
    expect(plan.lid).toEqual({ spans: [], stagnantHours: 0 });
    expect(plan.current).toMatchObject({
      blh: null,
      ventilationCoefficient: null,
      dispersion: null,
    });
    expect(ids(plan)).not.toContain('lid');
    expect(plan.headline).toMatch(/^Air is /);
    // The rest of the plan does not depend on the boundary layer.
    expect(ids(plan)).toContain('ventilate');
  });

  it('still plans when the whole weather feed is missing', () => {
    const air = makeSnapshot({
      hourly: hourlyWith({ blh: null, wind: null, temp: null, rh: null }),
    });
    const plan = buildPlan(DEFAULT_HOUSEHOLD, air, NOW);
    expect(plan.current.wind).toBeNull();
    expect(plan.lid.stagnantHours).toBe(0);
    expect(plan.totals.exposureCutPct).toBeGreaterThan(0);
  });

  it('claims no saving from outdoor air when there are no PM2.5 readings at all', () => {
    const quiet = household((hh) => {
      hh.home = { ...hh.home, incense: false, mosquitoCoil: false };
    });
    const air = makeSnapshot({ hourly: hourlyWith({ pm25: null, pm10: null }) });
    const plan = buildPlan(quiet, air, NOW);
    expect(plan.current.pm25).toBeNull();
    expect(plan.cleanWindow).toBeNull();
    expect(plan.worstWindow).toBeNull();
    expect(ids(plan)).not.toContain('ventilate');
    // Exercise stays where it is: a missing reading is not treated as proof of dirty air.
    expect(plan.items.filter((i) => i.kind === 'exercise').every((i) => i.status === 'go')).toBe(
      true,
    );
    expect(JSON.stringify(plan)).not.toMatch(/NaN|Infinity/);
  });

  it('reports AQI 0 and "Good" when no pollutant has a reading', () => {
    const air = makeSnapshot({
      hourly: hourlyWith({ pm25: null, pm10: null, no2: null, o3: null }),
    });
    const plan = buildPlan(DEFAULT_HOUSEHOLD, air, NOW);
    expect(plan.risk).toMatchObject({ aqi: 0, level: 0, label: 'Good', dominant: 'pm25' });
  });

  it('tops out at AQI 500 in a dust storm rather than extrapolating', () => {
    const air = makeSnapshot({ hourly: hourlyWith({ pm25: 4000, pm10: 9000 }) });
    for (const standard of ['us', 'in'] as const) {
      const plan = buildPlan(
        household((hh) => {
          hh.standard = standard;
        }),
        air,
        NOW,
      );
      expect(plan.risk.aqi).toBe(500);
      expect(plan.risk.level).toBe(5);
    }
  });

  it('gives a perfectly clean day nothing to move and nothing to fear', () => {
    const air = makeSnapshot({ hourly: hourlyWith({ pm25: 0, pm10: 0, no2: 0, o3: 0 }) });
    const plan = buildPlan(DEFAULT_HOUSEHOLD, air, NOW);
    expect(plan.risk.aqi).toBe(0);
    expect(ids(plan)).not.toContain('ventilate');
    expect(plan.members.every((m) => m.optimizedDoseUg <= m.baselineDoseUg)).toBe(true);
  });
});

describe('buildPlan with unusual households', () => {
  it('plans for a single person who neither commutes nor exercises', () => {
    const solo = household((hh) => {
      hh.members = [{ ...hh.members[0]!, daytime: 'home', exercise: 'none' }];
      hh.commute = { ...hh.commute, mode: 'wfh' };
    });
    const plan = buildPlan(solo, makeSnapshot(), NOW);
    expect(plan.members.map((m) => m.id)).toEqual(['you']);
    expect(plan.items.every((i) => i.memberIds.join() === 'you')).toBe(true);
    expect(ids(plan).some((id) => id.startsWith('exercise-') || id.startsWith('commute'))).toBe(
      false,
    );
    expect(plan.totals.baselineDoseUg).toBe(plan.members[0]!.baselineDoseUg);
    expect(plan.totals.co2SavedKgWeek).toBe(0);
  });

  it('gives no commute advice and counts no CO2 for a zero-distance commute', () => {
    const next = household((hh) => {
      hh.commute = { ...hh.commute, distanceKm: 0, flexible: true };
    });
    const plan = buildPlan(next, makeSnapshot(), NOW);
    expect(ids(plan).filter((id) => id.startsWith('commute'))).toEqual([]);
    expect(plan.totals.co2SavedKgDay).toBe(0);
    expect(plan.totals.co2SavedKgWeek).toBe(0);
  });

  it('counts no weekly CO2 for a commute that happens zero days a week', () => {
    const never = household((hh) => {
      hh.commute = { ...hh.commute, daysPerWeek: 0 };
    });
    const plan = buildPlan(never, makeSnapshot(), NOW);
    expect(plan.totals.co2SavedKgDay).toBeGreaterThan(0);
    expect(plan.totals.co2SavedKgWeek).toBe(0);
  });

  it('skips commute advice when the commuter id matches nobody', () => {
    const orphan = household((hh) => {
      hh.commute = { ...hh.commute, memberId: 'moved-out' };
    });
    const plan = buildPlan(orphan, makeSnapshot(), NOW);
    expect(ids(plan).filter((id) => id.startsWith('commute'))).toEqual([]);
    // Stored and posted profiles go through parseHousehold, which repairs the id first.
    const repaired = buildPlan(parseHousehold(orphan)!, makeSnapshot(), NOW);
    expect(ids(repaired)).toContain('commute');
  });

  it('handles a commute that leaves and returns in the same hour', () => {
    const quick = household((hh) => {
      hh.commute = { ...hh.commute, departHour: 9, returnHour: 9 };
    });
    const plan = buildPlan(quick, makeSnapshot(), NOW);
    expect(Number.isFinite(plan.totals.baselineDoseUg)).toBe(true);
    expect(plan.members[0]!.baselineDoseUg).toBeGreaterThan(0);
  });

  it('ignores an exercise session of zero minutes when adding up the dose', () => {
    const idle = household((hh) => {
      hh.members[0] = { ...hh.members[0]!, exerciseMinutes: 0 };
    });
    const none = household((hh) => {
      hh.members[0] = { ...hh.members[0]!, exercise: 'none' };
    });
    const withIdle = buildPlan(idle, makeSnapshot(), NOW).members[0]!;
    const without = buildPlan(none, makeSnapshot(), NOW).members[0]!;
    expect(withIdle.baselineDoseUg).toBe(without.baselineDoseUg);
  });

  it('skips exercise advice when the usual hour falls outside the hours left in the forecast', () => {
    // Three hours of data from 00:00; nobody's exercise or airing hour is inside them.
    const short = makeSnapshot({ hourly: makeHourly().slice(24, 27), nowIndex: 0 });
    const plan = buildPlan(DEFAULT_HOUSEHOLD, short, NOW);
    expect(ids(plan).filter((id) => id.startsWith('exercise-'))).toEqual([]);
    expect(ids(plan)).not.toContain('ventilate');
  });

  it('keeps the smallest and the largest home the profile allows finite', () => {
    for (const areaM2 of [5, 200]) {
      const plan = buildPlan(
        household((hh) => {
          hh.home = { ...hh.home, areaM2, cooking: 'biomass', heating: 'coal' };
        }),
        makeSnapshot(),
        NOW,
      );
      expect(JSON.stringify(plan)).not.toMatch(/NaN|Infinity|null,"optimizedDoseUg"/);
      expect(planResultSchema.safeParse(plan).success).toBe(true);
      expect(ids(plan)).toEqual(expect.arrayContaining(['heating', 'clean-cooking']));
    }
  });
});
