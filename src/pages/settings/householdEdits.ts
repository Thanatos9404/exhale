/**
 * Pure edits to a household draft: validate it, add, remove and patch members, toggle a health
 * condition. Each returns a new household, so the Settings form stays a thin layer over them.
 */
import { householdSchema, type Household, type Member } from '@/lib/profile/schema';

/** Validation messages keyed by dotted field path, e.g. `members.0.name`. */
export type FieldErrors = Record<string, string>;

/** Runs the household schema and flattens its issues into one message per field. */
export function validateHousehold(household: Household): FieldErrors {
  const result = householdSchema.safeParse(household);
  if (result.success) return {};
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) errors[issue.path.join('.')] = issue.message;
  return errors;
}

/**
 * An id for a new member that no current member uses. Based on the clock, with a counter suffix
 * when two people are added within the same millisecond.
 */
export function newMemberId(household: Household, now: number): string {
  const taken = new Set(household.members.map((member) => member.id));
  const base = `p-${now.toString(36)}`;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** A new default member, named after their position in the household. */
export function addMember(household: Household, id: string): Household {
  const member: Member = {
    id,
    name: `Person ${household.members.length + 1}`,
    ageGroup: 'adult',
    conditions: [],
    daytime: 'home',
    exercise: 'none',
    exerciseHour: 7,
    exerciseMinutes: 30,
  };
  return { ...household, members: [...household.members, member] };
}

/**
 * Removes a member and, if they were the commuter, hands the commute to the first person left.
 * The last member cannot be removed, so the household always keeps someone to plan for.
 */
export function removeMember(household: Household, id: string): Household {
  const members = household.members.filter((m) => m.id !== id);
  const [nextCommuter] = members;
  if (!nextCommuter) return household;
  const commute =
    household.commute.memberId === id
      ? { ...household.commute, memberId: nextCommuter.id }
      : household.commute;
  return { ...household, members, commute };
}

/** Merges a partial update into one member, leaving the others untouched. */
export function patchMember(household: Household, id: string, patch: Partial<Member>): Household {
  return {
    ...household,
    members: household.members.map((m) => (m.id === id ? { ...m, ...patch } : m)),
  };
}

/** Adds or removes one health condition. */
export function toggleCondition(
  conditions: Member['conditions'],
  condition: Member['conditions'][number],
  checked: boolean,
): Member['conditions'] {
  return checked ? [...conditions, condition] : conditions.filter((c) => c !== condition);
}
