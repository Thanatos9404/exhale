/** The settings form's state: an editable draft of the household, its validation and saving. */
import { useMemo, useState } from 'react';
import { notify } from '@/components/shell/toasts';
import { useAppState } from '@/state/AppState';
import { householdSchema, type Household, type Member } from '@/lib/profile/schema';
import {
  addMember,
  newMemberId,
  patchMember,
  removeMember,
  validateHousehold,
  type FieldErrors,
} from './householdEdits';

/** Unsaved edits, tagged with the saved household they started from. */
interface DraftEdit {
  base: Household;
  value: Household;
}

/** The settings form: the working copy of the household and every way to change it. */
export interface HouseholdForm {
  draft: Household;
  errors: FieldErrors;
  /** True when the draft differs from the saved household. */
  dirty: boolean;
  save: () => void;
  patch: (p: Partial<Household>) => void;
  patchHome: (p: Partial<Household['home']>) => void;
  patchCommute: (p: Partial<Household['commute']>) => void;
  patchMember: (id: string, p: Partial<Member>) => void;
  addMember: () => void;
  removeMember: (id: string) => void;
}

/**
 * Keeps an editable draft of the household profile.
 *
 * The draft is derived during render: edits only apply while the saved household is the one
 * they were made against, so a save, reset or wipe elsewhere shows the new household at once.
 */
export function useHouseholdDraft(): HouseholdForm {
  const { household, setHousehold } = useAppState();
  const [edit, setEdit] = useState<DraftEdit | null>(null);
  const draft = edit?.base === household ? edit.value : household;

  const errors = useMemo(() => validateHousehold(draft), [draft]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(household);

  const update = (change: (d: Household) => Household) => {
    setEdit((prev) => {
      const current = prev?.base === household ? prev.value : household;
      return { base: household, value: change(current) };
    });
  };

  const save = () => {
    const result = householdSchema.safeParse(draft);
    if (!result.success) {
      notify.error('Fix the highlighted fields first');
      return;
    }
    setEdit(null);
    setHousehold(result.data);
    notify.success('Household saved. Your plan has been recalculated.');
  };

  return {
    draft,
    errors,
    dirty,
    save,
    patch: (p) => update((d) => ({ ...d, ...p })),
    patchHome: (p) => update((d) => ({ ...d, home: { ...d.home, ...p } })),
    patchCommute: (p) => update((d) => ({ ...d, commute: { ...d.commute, ...p } })),
    patchMember: (id, p) => update((d) => patchMember(d, id, p)),
    addMember: () => {
      const now = Date.now();
      update((d) => addMember(d, newMemberId(d, now)));
    },
    removeMember: (id) => update((d) => removeMember(d, id)),
  };
}
