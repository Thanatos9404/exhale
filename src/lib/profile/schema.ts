import { z } from 'zod';

/**
 * Household profile: the user context every decision is based on.
 * One schema validates localStorage on the client and request bodies on the server.
 */

const safeText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    // Plain words only: blocks markup and prompt-delimiter tricks in free-text fields.
    .regex(/^[\p{L}\p{N} .,'()&-]*$/u, 'Use letters, numbers and basic punctuation only');

export const ageGroupSchema = z.enum(['child', 'teen', 'adult', 'senior']);
export const conditionSchema = z.enum(['asthma', 'copd', 'heart', 'pregnancy']);
export const exerciseSchema = z.enum(['none', 'walk', 'run', 'cycle', 'yoga']);
export const daytimeSchema = z.enum(['home', 'office', 'school']);
export const commuteModeSchema = z.enum([
  'wfh',
  'walk',
  'cycle',
  'metro',
  'bus',
  'auto',
  'twoWheeler',
  'car',
  'ev',
]);
const hour = z.number().int().min(0).max(23);

export const memberSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,24}$/),
  name: safeText(32).min(1),
  ageGroup: ageGroupSchema,
  conditions: z.array(conditionSchema).max(4).default([]),
  daytime: daytimeSchema.default('home'),
  exercise: exerciseSchema.default('none'),
  exerciseHour: hour.default(6),
  exerciseMinutes: z.number().int().min(0).max(240).default(45),
});

export const householdSchema = z.object({
  version: z.literal(1).default(1),
  name: safeText(40).min(1).default('My household'),
  standard: z.enum(['us', 'in']).default('in'),
  members: z.array(memberSchema).min(1).max(8),
  commute: z.object({
    memberId: z.string().max(24),
    mode: commuteModeSchema,
    distanceKm: z.number().min(0).max(100),
    departHour: hour,
    returnHour: hour,
    daysPerWeek: z.number().int().min(0).max(7),
    flexible: z.boolean().default(false),
    hasN95: z.boolean().default(false),
  }),
  home: z.object({
    areaM2: z.number().min(5).max(200),
    ventilation: z.enum(['sealed', 'normal', 'leaky']),
    purifier: z.enum(['none', 'small', 'medium', 'large', 'diy']),
    airingHour: hour.default(8),
    cooking: z.enum(['lpg', 'electric', 'biomass']),
    kitchenExhaust: z.boolean(),
    heating: z.enum(['none', 'electric', 'gas', 'wood', 'coal']),
    incense: z.boolean(),
    mosquitoCoil: z.boolean(),
    indoorSmoking: z.boolean(),
  }),
});

export type Member = z.infer<typeof memberSchema>;
export type Household = z.infer<typeof householdSchema>;
export type Daytime = z.infer<typeof daytimeSchema>;
export type Exercise = z.infer<typeof exerciseSchema>;

/** A realistic starting household so the dashboard is useful before anyone edits it. */
export const DEFAULT_HOUSEHOLD: Household = {
  version: 1,
  name: 'My household',
  standard: 'in',
  members: [
    {
      id: 'you',
      name: 'You',
      ageGroup: 'adult',
      conditions: [],
      daytime: 'office',
      exercise: 'walk',
      exerciseHour: 6,
      exerciseMinutes: 45,
    },
    {
      id: 'kid',
      name: 'Kid',
      ageGroup: 'child',
      conditions: ['asthma'],
      daytime: 'school',
      exercise: 'cycle',
      exerciseHour: 17,
      exerciseMinutes: 60,
    },
    {
      id: 'nani',
      name: 'Nani',
      ageGroup: 'senior',
      conditions: ['heart'],
      daytime: 'home',
      exercise: 'walk',
      exerciseHour: 7,
      exerciseMinutes: 30,
    },
  ],
  commute: {
    memberId: 'you',
    mode: 'car',
    distanceKm: 14,
    departHour: 9,
    returnHour: 18,
    daysPerWeek: 5,
    flexible: true,
    hasN95: false,
  },
  home: {
    areaM2: 45,
    ventilation: 'normal',
    purifier: 'none',
    airingHour: 8,
    cooking: 'lpg',
    kitchenExhaust: false,
    heating: 'electric',
    incense: true,
    mosquitoCoil: true,
    indoorSmoking: false,
  },
};

/** Parses stored or posted data, returning null instead of throwing on anything invalid. */
export function parseHousehold(input: unknown): Household | null {
  const r = householdSchema.safeParse(input);
  if (!r.success) return null;
  const h = r.data;
  // Keep the commute pointing at a real member.
  if (!h.members.some((m) => m.id === h.commute.memberId)) h.commute.memberId = h.members[0]!.id;
  return h;
}
