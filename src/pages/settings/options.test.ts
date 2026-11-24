import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HOUSEHOLD,
  ageGroupSchema,
  commuteModeSchema,
  conditionSchema,
  daytimeSchema,
  exerciseSchema,
  householdSchema,
  type Household,
} from '@/lib/profile/schema';
import { PURIFIER_CADR } from '@/lib/science/indoor';
import {
  AGE_GROUP_OPTIONS,
  CONDITIONS,
  COOKING_OPTIONS,
  DAYTIME_OPTIONS,
  EXERCISE_OPTIONS,
  HEATING_OPTIONS,
  HOUR_OPTIONS,
  MAX_MEMBERS,
  MODE_OPTIONS,
  PURIFIER_OPTIONS,
  SECTIONS,
  type Option,
} from './options';

const homeShape = householdSchema.shape.home.shape;

/** Every option list next to the values the schema accepts for that field. */
const SELECTS: [string, Option<string>[], readonly string[]][] = [
  ['conditions', CONDITIONS, conditionSchema.options],
  ['age group', AGE_GROUP_OPTIONS, ageGroupSchema.options],
  ['daytime', DAYTIME_OPTIONS, daytimeSchema.options],
  ['exercise', EXERCISE_OPTIONS, exerciseSchema.options],
  ['commute mode', MODE_OPTIONS, commuteModeSchema.options],
  ['purifier', PURIFIER_OPTIONS, homeShape.purifier.options],
  ['cooking', COOKING_OPTIONS, homeShape.cooking.options],
  ['heating', HEATING_OPTIONS, homeShape.heating.options],
];

describe('settings options', () => {
  it.each(SELECTS)('offers exactly the %s values the schema accepts', (_, options, accepted) => {
    expect(options.map((o) => o.value).sort()).toEqual([...accepted].sort());
  });

  it.each(SELECTS)('gives every %s option its own readable label', (_, options) => {
    const labels = options.map((o) => o.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const label of labels) {
      expect(label.trim()).toBe(label);
      expect(label).toMatch(/^[A-Z]/);
    }
  });

  it('lists commute modes in schema order, starting with working from home', () => {
    expect(MODE_OPTIONS.map((o) => o.value)).toEqual(commuteModeSchema.options);
    expect(MODE_OPTIONS[0]).toEqual({ value: 'wfh', label: 'Work from home' });
  });

  it('labels the bought purifiers with their clean-air delivery rate', () => {
    for (const size of ['small', 'medium', 'large'] as const) {
      const option = PURIFIER_OPTIONS.find((o) => o.value === size)!;
      expect(option.label).toContain(`${PURIFIER_CADR[size]} m³/h`);
    }
  });
});

describe('hour options', () => {
  it('covers the 24 whole hours of the day in order', () => {
    expect(HOUR_OPTIONS.map((o) => o.value)).toEqual(Array.from({ length: 24 }, (_, h) => h));
    expect(HOUR_OPTIONS[0]!.label).toBe('00:00');
    expect(HOUR_OPTIONS[9]!.label).toBe('09:00');
    expect(HOUR_OPTIONS[23]!.label).toBe('23:00');
  });

  it('offers only hours the schema accepts for an exercise slot', () => {
    for (const { value } of HOUR_OPTIONS) {
      const household: Household = {
        ...DEFAULT_HOUSEHOLD,
        members: [{ ...DEFAULT_HOUSEHOLD.members[0]!, exerciseHour: value }],
      };
      expect(householdSchema.safeParse(household).success).toBe(true);
    }
  });
});

describe('household size limit', () => {
  const householdOf = (count: number): Household => ({
    ...DEFAULT_HOUSEHOLD,
    members: Array.from({ length: count }, (_, i) => ({
      ...DEFAULT_HOUSEHOLD.members[0]!,
      id: i === 0 ? 'you' : `p-${i}`,
    })),
  });

  it('matches the most members the schema accepts', () => {
    expect(householdSchema.safeParse(householdOf(MAX_MEMBERS)).success).toBe(true);
    expect(householdSchema.safeParse(householdOf(MAX_MEMBERS + 1)).success).toBe(false);
  });
});

describe('settings sections', () => {
  it('lists each section once, with an id usable as an anchor', () => {
    const sectionIds = SECTIONS.map((s) => s.id);
    expect(sectionIds).toEqual(['general', 'people', 'commute', 'home', 'data']);
    expect(new Set(sectionIds).size).toBe(sectionIds.length);
    for (const section of SECTIONS) {
      expect(section.id).toMatch(/^[a-z][a-z-]*$/);
      expect(section.label.length).toBeGreaterThan(0);
    }
  });
});
