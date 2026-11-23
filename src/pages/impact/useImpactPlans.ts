import { useMemo, useState } from 'react';
import type { AirSnapshot } from '@/lib/air/types';
import { buildPlan, type PlanResult } from '@/lib/planner/engine';
import type { Household } from '@/lib/profile/schema';
import { buildSelectedPlan } from './plans';

/** The full plan and the plan with only the switched-on changes. */
export interface ImpactPlans {
  /** The plan with every change applied; null until data has loaded. */
  full: PlanResult | null;
  /** The plan with only the switched-on free changes applied. */
  selected: PlanResult | null;
}

/** Both plans the Impact page compares, memoised on the data, the profile and the switches. */
export function useImpactPlans(
  household: Household,
  air: AirSnapshot | undefined,
  off: ReadonlySet<string>,
): ImpactPlans {
  const full = useMemo(() => (air ? buildPlan(household, air) : null), [air, household]);
  const selected = useMemo(
    () => (air && full ? buildSelectedPlan(household, air, full, off) : null),
    [air, full, household, off],
  );
  return { full, selected };
}

/** Which changes are switched off, and the actions that flip them. */
export interface ChangeSwitches {
  /** Ids of the changes switched off. */
  off: ReadonlySet<string>;
  /** Switches one change on or off. */
  setApplied: (id: string, on: boolean) => void;
  /** Switches every change back on. */
  applyAll: () => void;
}

/** Which plan changes the user has switched off; all start on. */
export function useChangeSwitches(): ChangeSwitches {
  const [off, setOff] = useState<ReadonlySet<string>>(() => new Set());
  const setApplied = (id: string, on: boolean) =>
    setOff((prev) => {
      const next = new Set(prev);
      if (on) next.delete(id);
      else next.add(id);
      return next;
    });
  return { off, setApplied, applyAll: () => setOff(new Set()) };
}
