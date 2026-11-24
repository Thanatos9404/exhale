/**
 * Household profile: the user context every decision is based on.
 * One schema validates localStorage on the client and request bodies on the server.
 */
import { z } from 'zod';

const safeText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    // Plain words only: blocks markup and prompt-delimiter tricks in free-text fields.
    // Combining marks (\p{M}) are part of words in Indic and other scripts: "नानी" needs them.
    .regex(/^[\p{L}\p{M}\p{N} .,'()&-]*$/u, 'Use letters, numbers and basic punctuation only');

/** Age bands with distinct breathing rates and sensitivity (see science/exposure). */
export const ageGroupSchema = z.enum(['child', 'teen', 'adult', 'senior']);
/** Health conditions that lower a person's outdoor-effort PM2.5 limit. */
export const conditionSchema = z.enum(['asthma', 'copd', 'heart', 'pregnancy']);
/** Usual exercise; 'none' skips exercise advice for that member. */
export const exerciseSchema = z.enum(['none', 'walk', 'run', 'cycle', 'yoga']);
/** Where a member spends the working day when they are not the commuter. */
export const daytimeSchema = z.enum(['home', 'office', 'school']);
/** Commute modes; must match `CommuteMode` in science/commute. */
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
/** Local hour of day, 0 to 23. */
const hour = z.number().int().min(0).max(23);

/** Longest member id, in characters. */
const MEMBER_ID_LENGTH = 24;

/** One person in the household. `id` is a short slug; 'you' marks the profile owner. */
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

/** One to eight members. Ids are not checked here, so stored duplicates can still be repaired. */
const membersSchema = z.array(memberSchema).min(1).max(8);

const profileShape = {
  version: z.literal(1).default(1),
  name: safeText(40).min(1).default('My household'),
  standard: z.enum(['us', 'in']).default('in'),
  members: membersSchema,
  commute: z.object({
    memberId: z.string().max(MEMBER_ID_LENGTH),
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
};

/**
 * The profile as it may sit in storage: everything valid except that two members may share an
 * id. Only `parseHousehold` reads with it, to repair the ids instead of losing the profile.
 */
const storedHouseholdSchema = z.object(profileShape);

/**
 * The whole profile: who lives there, the one modelled commute, and the home. Areas are m²,
 * distances km, hours local 0 to 23.
 *
 * Member ids must be unique. The planner keys every exposure, item and what-if selection by
 * id, so two members sharing one would be reported as a single person and the household totals
 * would miss the other.
 */
export const householdSchema = z.object({
  ...profileShape,
  members: membersSchema.check((ctx) => {
    const seen = new Set<string>();
    ctx.value.forEach((member, index) => {
      if (seen.has(member.id)) {
        ctx.issues.push({
          code: 'custom',
          input: member.id,
          path: [index, 'id'],
          message: `Member id "${member.id}" is already used by another member; ids must be unique`,
        });
      }
      seen.add(member.id);
    });
  }),
});

/** A validated household member. */
export type Member = z.infer<typeof memberSchema>;
/** A validated household profile. */
export type Household = z.infer<typeof householdSchema>;
/** Where a member spends the working day. */
export type Daytime = z.infer<typeof daytimeSchema>;
/** A member's usual exercise. */
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

/** An id nobody in `taken` has: `id` with the lowest numeric suffix that is free, e.g. "kid-2". */
function freshId(id: string, taken: ReadonlySet<string>): string {
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = `${id.slice(0, MEMBER_ID_LENGTH - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Gives every member their own id. The first holder of an id keeps it, so the commute and any
 * saved selection still point at the same person; each later holder gets a fresh one. The
 * result is the same on every load, since it depends only on the order of the members.
 */
function withUniqueIds(members: readonly Member[]): Member[] {
  const taken = new Set(members.map((m) => m.id));
  const seen = new Set<string>();
  return members.map((member) => {
    if (!seen.has(member.id)) {
      seen.add(member.id);
      return member;
    }
    const id = freshId(member.id, taken);
    taken.add(id);
    return { ...member, id };
  });
}

/**
 * Parses stored or posted data, returning null instead of throwing on anything invalid. Two
 * slips that would otherwise cost the user their whole profile are repaired instead: members
 * sharing an id get ids of their own, and a commute pointing at nobody is handed to the first
 * member. The result always satisfies `householdSchema`.
 */
export function parseHousehold(input: unknown): Household | null {
  const r = storedHouseholdSchema.safeParse(input);
  if (!r.success) return null;
  const members = withUniqueIds(r.data.members);
  const { commute } = r.data;
  // Keep the commute pointing at a real member. The schema guarantees at least one.
  const [first] = members;
  const orphaned = first && !members.some((m) => m.id === commute.memberId);
  return {
    ...r.data,
    members,
    commute: orphaned ? { ...commute, memberId: first.id } : commute,
  };
}
