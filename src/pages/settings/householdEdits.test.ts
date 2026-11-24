import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HOUSEHOLD,
  ageGroupSchema,
  conditionSchema,
  daytimeSchema,
  exerciseSchema,
  householdSchema,
  type Household,
  type Member,
} from '@/lib/profile/schema';
import {
  addMember,
  patchMember,
  removeMember,
  toggleCondition,
  validateHousehold,
} from './householdEdits';
import { MAX_MEMBERS } from './options';

const base = DEFAULT_HOUSEHOLD;
const ids = (h: Household) => h.members.map((m) => m.id);

describe('validateHousehold', () => {
  it('has nothing to report for a valid household', () => {
    expect(validateHousehold(base)).toEqual({});
  });

  it('reports a bad field under its dotted path', () => {
    const errors = validateHousehold(patchMember(base, 'kid', { name: '' }));
    expect(Object.keys(errors)).toEqual(['members.1.name']);
    expect(errors['members.1.name']!.length).toBeGreaterThan(0);
  });

  it('explains what is wrong with a name that holds markup', () => {
    const errors = validateHousehold({ ...base, name: '<script>' });
    expect(errors).toEqual({ name: 'Use letters, numbers and basic punctuation only' });
  });

  it('reports every bad field at once, nested ones included', () => {
    const broken: Household = {
      ...base,
      home: { ...base.home, areaM2: 2 },
      commute: { ...base.commute, distanceKm: 500 },
      members: base.members.map((m) => ({ ...m, exerciseHour: 24 })),
    };
    expect(Object.keys(validateHousehold(broken)).sort()).toEqual([
      'commute.distanceKm',
      'home.areaM2',
      'members.0.exerciseHour',
      'members.1.exerciseHour',
      'members.2.exerciseHour',
    ]);
  });

  it('flags the second member that shares an id', () => {
    const errors = validateHousehold(patchMember(base, 'nani', { id: 'kid' }));
    expect(Object.keys(errors)).toEqual(['members.2.id']);
    expect(errors['members.2.id']).toContain('"kid"');
  });

  it('flags a household with nobody in it', () => {
    expect(Object.keys(validateHousehold({ ...base, members: [] }))).toEqual(['members']);
  });
});

describe('addMember', () => {
  it('adds a default adult at the end, named after their position', () => {
    const next = addMember(base, 'p-new');
    expect(ids(next)).toEqual(['you', 'kid', 'nani', 'p-new']);
    expect(next.members[3]).toMatchObject({
      id: 'p-new',
      name: 'Person 4',
      ageGroup: 'adult',
      conditions: [],
      exercise: 'none',
    });
    expect(validateHousehold(next)).toEqual({});
  });

  it('leaves the existing members, the commute and the original household alone', () => {
    const next = addMember(base, 'p-new');
    expect(next.members.slice(0, 3)).toEqual(base.members);
    expect(next.commute).toBe(base.commute);
    expect(next.home).toBe(base.home);
    expect(base.members).toHaveLength(3);
  });

  it('can fill the household up to its limit', () => {
    let household = base;
    for (let i = base.members.length; i < MAX_MEMBERS; i++)
      household = addMember(household, `p-${i}`);
    expect(household.members).toHaveLength(MAX_MEMBERS);
    expect(validateHousehold(household)).toEqual({});
    expect(household.members.at(-1)!.name).toBe(`Person ${MAX_MEMBERS}`);
  });
});

describe('removeMember', () => {
  it('removes the member and keeps the rest in order', () => {
    const next = removeMember(base, 'kid');
    expect(ids(next)).toEqual(['you', 'nani']);
    expect(next.commute).toBe(base.commute);
    expect(validateHousehold(next)).toEqual({});
  });

  it('hands the commute to the first person left when the commuter goes', () => {
    const next = removeMember(base, 'you');
    expect(ids(next)).toEqual(['kid', 'nani']);
    expect(next.commute).toEqual({ ...base.commute, memberId: 'kid' });
    expect(validateHousehold(next)).toEqual({});
  });

  it('never removes the last member', () => {
    const alone = removeMember(removeMember(base, 'kid'), 'nani');
    expect(ids(alone)).toEqual(['you']);
    expect(removeMember(alone, 'you')).toBe(alone);
  });

  it('changes nothing for an id nobody has', () => {
    expect(removeMember(base, 'stranger')).toEqual(base);
  });

  it('does not alter the household it was given', () => {
    removeMember(base, 'you');
    expect(ids(base)).toEqual(['you', 'kid', 'nani']);
    expect(base.commute.memberId).toBe('you');
  });
});

describe('patchMember', () => {
  it('merges the change into that member only', () => {
    const next = patchMember(base, 'kid', { exercise: 'run', exerciseHour: 16 });
    expect(next.members[1]).toEqual({ ...base.members[1], exercise: 'run', exerciseHour: 16 });
    expect(next.members[0]).toBe(base.members[0]);
    expect(next.members[2]).toBe(base.members[2]);
    expect(base.members[1]!.exercise).toBe('cycle');
  });

  it('changes nobody for an unknown id or an empty patch', () => {
    expect(patchMember(base, 'stranger', { name: 'Ghost' })).toEqual(base);
    expect(patchMember(base, 'kid', {})).toEqual(base);
  });
});

describe('toggleCondition', () => {
  it('adds a condition when checked and removes it when unchecked', () => {
    expect(toggleCondition(['asthma'], 'heart', true)).toEqual(['asthma', 'heart']);
    expect(toggleCondition(['asthma', 'heart'], 'asthma', false)).toEqual(['heart']);
    expect(toggleCondition([], 'copd', true)).toEqual(['copd']);
  });

  it('does nothing when asked to remove a condition that is not there', () => {
    expect(toggleCondition(['asthma'], 'copd', false)).toEqual(['asthma']);
    expect(toggleCondition([], 'copd', false)).toEqual([]);
  });

  it('returns a new list and leaves the old one alone', () => {
    const conditions: Member['conditions'] = ['asthma'];
    expect(toggleCondition(conditions, 'heart', true)).not.toBe(conditions);
    expect(conditions).toEqual(['asthma']);
  });
});

describe('household edits keep the household valid', () => {
  type Edit = (h: Household, step: number) => Household;

  const memberAt = (h: Household, pick: number) => h.members[pick % h.members.length]!;
  const patchArb = fc.record(
    {
      name: fc.stringMatching(/^[A-Za-z][A-Za-z0-9 .'-]{0,20}$/),
      ageGroup: fc.constantFrom(...ageGroupSchema.options),
      daytime: fc.constantFrom(...daytimeSchema.options),
      exercise: fc.constantFrom(...exerciseSchema.options),
      exerciseHour: fc.integer({ min: 0, max: 23 }),
      exerciseMinutes: fc.integer({ min: 0, max: 240 }),
    },
    { requiredKeys: [] },
  );

  /** The edits the settings form can make: add below the limit, remove, patch, tick a condition. */
  const editArb: fc.Arbitrary<Edit> = fc.oneof(
    fc.constant<Edit>((h, step) =>
      h.members.length < MAX_MEMBERS ? addMember(h, `p-${step}`) : h,
    ),
    fc.nat().map<Edit>((pick) => (h) => removeMember(h, memberAt(h, pick).id)),
    fc.tuple(fc.nat(), patchArb).map<Edit>(([pick, patch]) => (h) => {
      return patchMember(h, memberAt(h, pick).id, patch);
    }),
    fc
      .tuple(fc.nat(), fc.constantFrom(...conditionSchema.options))
      .map<Edit>(([pick, condition]) => (h) => {
        const { id, conditions } = memberAt(h, pick);
        const checked = !conditions.includes(condition);
        return patchMember(h, id, {
          conditions: toggleCondition(conditions, condition, checked),
        });
      }),
  );

  it('after any sequence of form edits', () => {
    fc.assert(
      fc.property(fc.array(editArb, { maxLength: 40 }), (edits) => {
        let household = base;
        edits.forEach((edit, step) => {
          household = edit(household, step);
          expect(validateHousehold(household)).toEqual({});
          expect(householdSchema.safeParse(household).success).toBe(true);
          expect(ids(household)).toContain(household.commute.memberId);
        });
        expect(household.members.length).toBeGreaterThanOrEqual(1);
        expect(household.members.length).toBeLessThanOrEqual(MAX_MEMBERS);
      }),
    );
  });
});
