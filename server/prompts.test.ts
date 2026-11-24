// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  CHAT_SYSTEM,
  PLAN_SYSTEM,
  buildChatContext,
  buildPlanPrompt,
  describeHousehold,
  describePlan,
} from './prompts';
import { buildPlan, type PlanResult, type RoutineItem } from '../src/lib/planner/engine';
import { DEFAULT_HOUSEHOLD, type Household } from '../src/lib/profile/schema';
import { makeSnapshot } from '../src/test/fixtures';

const base = buildPlan(DEFAULT_HOUSEHOLD, makeSnapshot(), new Date('2026-11-23T00:00:00Z'));

/** The first line of `text` that starts with `prefix`. */
const line = (text: string, prefix: string) => text.split('\n').find((l) => l.startsWith(prefix));

describe('describeHousehold', () => {
  it('describes the default household line by line', () => {
    expect(describeHousehold(DEFAULT_HOUSEHOLD).split('\n')).toEqual([
      '<household>',
      'Name: My household',
      'People:',
      '- You: adult; daytime at office; exercise walk at 06:00 for 45 min',
      '- Kid: child, asthma; daytime at school; exercise cycle at 17:00 for 60 min',
      '- Nani: senior, heart; daytime at home; exercise walk at 07:00 for 30 min',
      'Commute: You, Car (petrol), 14 km each way, leaves 9:00, returns 18:00, 5 days a week, flexible hours: yes, owns N95: no',
      'Home: 45 m² kept closed, normal draught-proofing, purifier: none, usually airs at 8:00, cooks on lpg without exhaust, heating: electric, incense: yes, mosquito coil: yes, indoor smoking: no',
      '</household>',
    ]);
  });

  const sharma: Household = {
    ...DEFAULT_HOUSEHOLD,
    name: 'Sharma family',
    members: [
      {
        id: 'dadi',
        name: 'Dadi',
        ageGroup: 'senior',
        conditions: ['copd', 'heart'],
        daytime: 'home',
        exercise: 'none',
        exerciseHour: 6,
        exerciseMinutes: 45,
      },
      {
        id: 'riya',
        name: 'Riya',
        ageGroup: 'teen',
        conditions: [],
        daytime: 'school',
        exercise: 'run',
        exerciseHour: 5,
        exerciseMinutes: 20,
      },
    ],
    commute: {
      ...DEFAULT_HOUSEHOLD.commute,
      memberId: 'someone-who-left',
      mode: 'wfh',
      flexible: false,
      hasN95: true,
    },
    home: {
      ...DEFAULT_HOUSEHOLD.home,
      purifier: 'diy',
      cooking: 'biomass',
      kitchenExhaust: true,
      heating: 'coal',
      incense: false,
      mosquitoCoil: false,
      indoorSmoking: true,
    },
  };

  it('lists several conditions, no exercise, and zero-pads early exercise hours', () => {
    const text = describeHousehold(sharma);
    expect(text).toContain('Name: Sharma family');
    expect(line(text, '- Dadi')).toBe(
      '- Dadi: senior, copd, heart; daytime at home; exercise none',
    );
    expect(line(text, '- Riya')).toBe(
      '- Riya: teen; daytime at school; exercise run at 05:00 for 20 min',
    );
  });

  it('names an unknown commuter generically and states the opposite yes/no answers', () => {
    const text = describeHousehold(sharma);
    expect(line(text, 'Commute:')).toBe(
      'Commute: one member, Work from home, 14 km each way, leaves 9:00, returns 18:00, 5 days a week, flexible hours: no, owns N95: yes',
    );
    expect(line(text, 'Home:')).toBe(
      'Home: 45 m² kept closed, normal draught-proofing, purifier: diy, usually airs at 8:00, cooks on biomass with exhaust, heating: coal, incense: no, mosquito coil: no, indoor smoking: yes',
    );
  });
});

describe('describePlan', () => {
  const routine: RoutineItem[] = [
    {
      id: 'ventilate',
      kind: 'ventilate',
      status: 'go',
      time: '14:00',
      endTime: '15:00',
      title: 'Air out at 14:00',
      detail: 'The lid lifts after lunch.',
      memberIds: ['you'],
      impact: { doseSavedUg: 120, exposureCutPct: 12, cigarettesAvoided: 0.4, co2SavedKg: 0 },
      freeAction: true,
    },
    {
      id: 'purifier',
      kind: 'upgrade',
      status: 'caution',
      time: null,
      endTime: null,
      title: 'Add a purifier',
      detail: 'A CADR 250 unit suits 45 m².',
      memberIds: ['you', 'kid'],
      impact: { doseSavedUg: 900, exposureCutPct: 40, cigarettesAvoided: 3, co2SavedKg: -0.1 },
      freeAction: false,
    },
  ];

  const sparse: PlanResult = {
    ...base,
    placeLabel: 'Lahore, Pakistan',
    risk: { ...base.risk, aqi: 312, label: 'Hazardous', dominant: 'pm25', standard: 'us' },
    current: { pm25: null, blh: null, wind: null, ventilationCoefficient: null, dispersion: null },
    lid: { spans: [], stagnantHours: 0 },
    cleanWindow: null,
    worstWindow: null,
    items: routine,
  };

  it('writes n/a for missing readings and windows and says when there is no smog lid', () => {
    const text = describePlan(sparse);
    expect(line(text, 'Location:')).toBe(
      `Location: <place>Lahore, Pakistan</place>. Plan covers ${base.horizon.start} to ${base.horizon.end} local time.`,
    );
    expect(line(text, 'Now:')).toBe(
      'Now: AQI 312 (US EPA), "Hazardous", dominant pm25. PM2.5 n/a µg/m³, mixing height n/a m, wind n/a km/h, dispersion n/a.',
    );
    expect(line(text, 'Smog lid hours:')).toBe('Smog lid hours: none in the next 24 h.');
    expect(line(text, 'Cleanest')).toBe('Cleanest daytime hour: n/a. Dirtiest 3 h: n/a.');
  });

  it('reports readings, every smog-lid span and both windows when present', () => {
    const text = describePlan({
      ...sparse,
      risk: { ...sparse.risk, standard: 'in' },
      current: {
        pm25: 170,
        blh: 30,
        wind: 3,
        ventilationCoefficient: 25,
        dispersion: 'stagnant',
      },
      lid: {
        spans: [
          { start: '00:00', end: '10:00', minBlh: 30 },
          { start: '19:00', end: '23:00', minBlh: 45 },
        ],
        stagnantHours: 15,
      },
      cleanWindow: { start: '14:00', end: '15:00', pm25: 70 },
      worstWindow: { start: '06:00', end: '09:00', pm25: 210 },
    });
    expect(line(text, 'Now:')).toBe(
      'Now: AQI 312 (India NAQI), "Hazardous", dominant pm25. PM2.5 170 µg/m³, mixing height 30 m, wind 3 km/h, dispersion stagnant.',
    );
    expect(line(text, 'Smog lid hours:')).toBe(
      'Smog lid hours: 00:00 to 10:00 (mixing height down to 30 m); 19:00 to 23:00 (mixing height down to 45 m).',
    );
    expect(line(text, 'Cleanest')).toBe(
      'Cleanest daytime hour: 14:00 at 70 µg/m³. Dirtiest 3 h: 06:00 to 09:00 at 210 µg/m³.',
    );
  });

  it('marks upgrades and untimed items in the routine list', () => {
    const text = describePlan(sparse);
    expect(line(text, '- id=ventilate')).toBe(
      "- id=ventilate [go] 14:00: <item>Air out at 14:00. The lid lifts after lunch.</item> Impact: 120 µg less inhaled (12% of the affected people's day), 0.4 cigarette-equivalents avoided, 0 kg CO2e saved per day.",
    );
    expect(line(text, '- id=purifier')).toBe(
      "- id=purifier [caution, upgrade] any time: <item>Add a purifier. A CADR 250 unit suits 45 m².</item> Impact: 900 µg less inhaled (40% of the affected people's day), 3 cigarette-equivalents avoided, -0.1 kg CO2e saved per day.",
    );
  });

  it("passes each member's limits and doses and the household totals", () => {
    const text = describePlan(base);
    for (const m of base.members) {
      expect(line(text, `- <name>${m.name}</name>:`)).toBe(
        `- <name>${m.name}</name>: outdoor PM2.5 limit ${m.pm25Limit} µg/m³; WHO-level daily budget ${m.budgetUg} µg; today as usual ${m.baselineDoseUg} µg (${m.baselineCigarettes} cigarettes); with plan ${m.optimizedDoseUg} µg (${m.optimizedCigarettes} cigarettes)`,
      );
    }
    const t = base.totals;
    expect(line(text, 'Household totals:')).toBe(
      `Household totals: ${t.baselineDoseUg} µg as usual vs ${t.optimizedDoseUg} µg with the plan (${t.exposureCutPct}% less), ${t.cigarettesAvoided} cigarette-equivalents avoided, ${t.co2SavedKgWeek} kg CO2e saved per week.`,
    );
    expect(text.endsWith('about one cigarette (Berkeley Earth).')).toBe(true);
  });
});

describe('prompt assembly', () => {
  it('builds the chat context from the plan and household without a writing task', () => {
    const context = buildChatContext(base, DEFAULT_HOUSEHOLD);
    expect(context).toBe(
      `CONTEXT\n${describePlan(base)}\n\n${describeHousehold(DEFAULT_HOUSEHOLD)}`,
    );
    expect(context).not.toContain('TASK');
  });

  it('asks the plan model to keep the engine ids in order', () => {
    const prompt = buildPlanPrompt(base, DEFAULT_HOUSEHOLD);
    expect(prompt.startsWith(buildChatContext(base, DEFAULT_HOUSEHOLD))).toBe(true);
    expect(prompt).toMatch(/\nTASK\n.*same ids, same order/);
  });

  it('gives both system prompts the guardrails, with JSON for plans and Markdown for chat', () => {
    for (const system of [PLAN_SYSTEM, CHAT_SYSTEM]) {
      expect(system).toContain('Never invent measurements');
      expect(system).toContain('seek medical care now');
      expect(system).toContain('Never use em dashes');
    }
    expect(PLAN_SYSTEM).toMatch(/Return JSON only/);
    expect(CHAT_SYSTEM).toMatch(/under 180 words/);
  });
});
