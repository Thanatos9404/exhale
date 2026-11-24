import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notify } from '@/components/shell/toasts';
import { DEFAULT_HOUSEHOLD, householdSchema, type Household } from '@/lib/profile/schema';
import { KEYS } from '@/lib/storage';
import { AppStateProvider, useAppState } from '@/state/AppState';
import { useHouseholdDraft } from './useHouseholdDraft';

vi.mock('@/components/shell/toasts', () => ({
  notify: { success: vi.fn(), error: vi.fn(), loading: vi.fn() },
}));

/** The settings form next to the app state it saves into, as on the settings page. */
function renderForm() {
  const { result } = renderHook(() => ({ form: useHouseholdDraft(), app: useAppState() }), {
    wrapper: AppStateProvider,
  });
  return {
    form: () => result.current.form,
    app: () => result.current.app,
  };
}

const storedHousehold = (): unknown => JSON.parse(localStorage.getItem(KEYS.household) ?? 'null');
const memberIds = (h: Household) => h.members.map((m) => m.id);

beforeEach(() => {
  vi.mocked(notify.success).mockClear();
  vi.mocked(notify.error).mockClear();
});

describe('useHouseholdDraft before any edit', () => {
  it('starts on the saved household, clean and valid', () => {
    const { form } = renderForm();
    expect(form().draft).toEqual(DEFAULT_HOUSEHOLD);
    expect(form().dirty).toBe(false);
    expect(form().errors).toEqual({});
  });

  it('starts on the household kept in this browser', () => {
    const saved: Household = { ...DEFAULT_HOUSEHOLD, name: 'Sharma home' };
    localStorage.setItem(KEYS.household, JSON.stringify(saved));
    const { form } = renderForm();
    expect(form().draft).toEqual(saved);
    expect(form().dirty).toBe(false);
  });
});

describe('useHouseholdDraft edits', () => {
  it('changes the draft only, and marks it dirty', () => {
    const { form, app } = renderForm();
    act(() => form().patch({ name: 'Sharma home', standard: 'us' }));
    expect(form().draft).toMatchObject({ name: 'Sharma home', standard: 'us' });
    expect(form().dirty).toBe(true);
    expect(app().household).toEqual(DEFAULT_HOUSEHOLD);
    expect(storedHousehold()).toBeNull();
  });

  it('merges home, commute and member changes into their own part', () => {
    const { form } = renderForm();
    act(() => form().patchHome({ purifier: 'diy', areaM2: 60 }));
    act(() => form().patchCommute({ mode: 'metro', hasN95: true }));
    act(() => form().patchMember('kid', { exercise: 'none' }));
    const { draft } = form();
    expect(draft.home).toEqual({ ...DEFAULT_HOUSEHOLD.home, purifier: 'diy', areaM2: 60 });
    expect(draft.commute).toEqual({ ...DEFAULT_HOUSEHOLD.commute, mode: 'metro', hasN95: true });
    expect(draft.members[1]).toEqual({ ...DEFAULT_HOUSEHOLD.members[1], exercise: 'none' });
    expect(draft.members[0]).toEqual(DEFAULT_HOUSEHOLD.members[0]);
    expect(draft.name).toBe(DEFAULT_HOUSEHOLD.name);
  });

  it('applies several edits made before the next render', () => {
    const { form } = renderForm();
    act(() => {
      form().patch({ name: 'Sharma home' });
      form().patchHome({ incense: false });
      form().patchMember('you', { name: 'Asha' });
    });
    expect(form().draft.name).toBe('Sharma home');
    expect(form().draft.home.incense).toBe(false);
    expect(form().draft.members[0]!.name).toBe('Asha');
  });

  it('is clean again once the edit is undone by hand', () => {
    const { form } = renderForm();
    act(() => form().patch({ name: 'Sharma home' }));
    act(() => form().patch({ name: DEFAULT_HOUSEHOLD.name }));
    expect(form().dirty).toBe(false);
  });

  it('adds a default person with a fresh, valid id', () => {
    const { form } = renderForm();
    act(() => form().addMember());
    const { draft } = form();
    expect(draft.members).toHaveLength(4);
    expect(draft.members[3]).toMatchObject({ name: 'Person 4', ageGroup: 'adult' });
    expect(new Set(memberIds(draft)).size).toBe(4);
    expect(form().errors).toEqual({});
  });

  // Regression test for a bug fixed on 24 Nov 2026 (src/pages/settings/useHouseholdDraft.ts:77): the new member's id is `p-<Date.now()>`,
  // which only changes once a millisecond. Two adds in the same millisecond give two members the
  // same id, so the draft fails validation ("ids must be unique") and a later remove or edit of
  // one hits both.
  it('gives two people added in the same instant ids of their own', () => {
    const { form } = renderForm();
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      act(() => {
        form().addMember();
        form().addMember();
      });
    } finally {
      vi.useRealTimers();
    }
    expect(form().draft.members).toHaveLength(5);
    expect(new Set(memberIds(form().draft)).size).toBe(5);
    expect(form().errors).toEqual({});
  });

  it('removes a person and hands their commute to the first one left', () => {
    const { form } = renderForm();
    act(() => form().removeMember('you'));
    expect(memberIds(form().draft)).toEqual(['kid', 'nani']);
    expect(form().draft.commute.memberId).toBe('kid');
    expect(form().errors).toEqual({});
  });

  it('keeps the last person', () => {
    const { form } = renderForm();
    act(() => {
      form().removeMember('you');
      form().removeMember('kid');
      form().removeMember('nani');
    });
    expect(memberIds(form().draft)).toEqual(['nani']);
  });
});

describe('useHouseholdDraft validation', () => {
  it('reports each bad field under its path as soon as it is typed', () => {
    const { form } = renderForm();
    act(() => form().patchMember('kid', { name: '' }));
    act(() => form().patchHome({ areaM2: 2 }));
    expect(Object.keys(form().errors).sort()).toEqual(['home.areaM2', 'members.1.name']);
    act(() => form().patchMember('kid', { name: 'Chintu' }));
    expect(Object.keys(form().errors)).toEqual(['home.areaM2']);
  });

  it('refuses to save an invalid draft and keeps the edits for fixing', () => {
    const { form, app } = renderForm();
    act(() => form().patch({ name: '<b>Sharma</b>' }));
    act(() => form().save());
    expect(notify.error).toHaveBeenCalledWith('Fix the highlighted fields first');
    expect(notify.success).not.toHaveBeenCalled();
    expect(app().household).toEqual(DEFAULT_HOUSEHOLD);
    expect(storedHousehold()).toBeNull();
    expect(form().draft.name).toBe('<b>Sharma</b>');
    expect(form().dirty).toBe(true);
  });
});

describe('useHouseholdDraft save', () => {
  it('saves a valid draft to the app and this browser, and says so', () => {
    const { form, app } = renderForm();
    act(() => form().patch({ name: 'Sharma home' }));
    act(() => form().patchHome({ purifier: 'large' }));
    act(() => form().save());
    expect(app().household).toMatchObject({ name: 'Sharma home', home: { purifier: 'large' } });
    expect(householdSchema.safeParse(app().household).success).toBe(true);
    expect(storedHousehold()).toEqual(app().household);
    expect(notify.success).toHaveBeenCalledTimes(1);
    expect(notify.error).not.toHaveBeenCalled();
  });

  it('is clean after saving and shows what was saved', () => {
    const { form, app } = renderForm();
    act(() => form().patchCommute({ distanceKm: 22 }));
    act(() => form().save());
    expect(form().dirty).toBe(false);
    expect(form().draft).toEqual(app().household);
    expect(form().draft.commute.distanceKm).toBe(22);
  });

  it('saves names without the spaces typed around them', () => {
    const { form, app } = renderForm();
    act(() => form().patch({ name: '  Sharma home  ' }));
    act(() => form().save());
    expect(app().household.name).toBe('Sharma home');
    expect(form().draft.name).toBe('Sharma home');
  });

  it('keeps editing from the saved household after a save', () => {
    const { form, app } = renderForm();
    act(() => form().patch({ name: 'Sharma home' }));
    act(() => form().save());
    act(() => form().patchHome({ incense: false }));
    expect(form().draft).toMatchObject({ name: 'Sharma home', home: { incense: false } });
    expect(form().dirty).toBe(true);
    expect(app().household.home.incense).toBe(true);
  });
});

describe('useHouseholdDraft when the saved household changes elsewhere', () => {
  const other: Household = { ...DEFAULT_HOUSEHOLD, name: 'Imported home', standard: 'us' };

  it('drops unsaved edits and shows the new household at once', () => {
    const { form, app } = renderForm();
    act(() => form().patch({ name: 'Half-typed' }));
    act(() => app().setHousehold(other));
    expect(form().draft).toEqual(other);
    expect(form().dirty).toBe(false);
    expect(form().errors).toEqual({});
  });

  it('starts new edits from the new household, not from the dropped draft', () => {
    const { form, app } = renderForm();
    act(() => form().patchHome({ purifier: 'large' }));
    act(() => app().setHousehold(other));
    act(() => form().patchCommute({ mode: 'bus' }));
    expect(form().draft).toEqual({ ...other, commute: { ...other.commute, mode: 'bus' } });
  });

  it('shows the sample household after a saved profile is reset or wiped', () => {
    for (const leave of ['resetHousehold', 'clearLocalData'] as const) {
      const { form, app } = renderForm();
      act(() => app().setHousehold(other));
      act(() => form().patch({ name: 'Half-typed' }));
      act(() => app()[leave]());
      expect(form().draft).toEqual(DEFAULT_HOUSEHOLD);
      expect(form().dirty).toBe(false);
    }
  });

  // Regression test for a bug fixed on 24 Nov 2026 (src/pages/settings/useHouseholdDraft.ts:44): the draft is dropped only when the saved
  // household changes identity. A user who has never saved (or has just restored the sample) is
  // already on the DEFAULT_HOUSEHOLD object, so "Restore sample household" sets the same object,
  // nothing changes, and the unsaved edits stay on screen under a "Sample household restored"
  // toast. The same happens with "Delete local data".
  it('drops unsaved edits when the sample household is restored over itself', () => {
    const { form, app } = renderForm();
    act(() => form().patch({ name: 'Half-typed' }));
    act(() => app().resetHousehold());
    expect(form().draft).toEqual(DEFAULT_HOUSEHOLD);
    expect(form().dirty).toBe(false);
  });
});
