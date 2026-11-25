/**
 * Private explanations for the plan on screen: while the choice is on, the plan and household are
 * sent to the hybrid model (Gemini Nano on this device, else cloud Gemini through Firebase), once
 * Gemini Nano has been prepared, and asked again whenever the plan changes. A stale answer is
 * never shown for a newer plan.
 */
import { useEffect, useState } from 'react';
import type { AiEngine } from '@/lib/apiTypes';
import type { PlanResult } from '@/lib/planner/engine';
import type { Household } from '@/lib/profile/schema';
import type { PrivateAiControls } from '@/hooks/usePrivateAi';

/** Where the private explanations for the plan on screen stand. */
export type PrivateExplainState =
  | { status: 'off' }
  | { status: 'working' }
  | { status: 'ready'; why: Map<string, string>; engine: AiEngine }
  | { status: 'error'; message: string };

interface Answered {
  plan: PlanResult;
  household: Household;
  state: PrivateExplainState;
}

const messageOf = (err: unknown) =>
  err instanceof Error && err.message ? err.message : 'The private model did not answer';

/** Private explanations for `plan`, or `off` while the choice is off or unavailable. */
export function usePrivateExplanations(
  plan: PlanResult | null,
  household: Household,
  controls: PrivateAiControls,
): PrivateExplainState {
  const { enabled, client, whenPrepared } = controls;
  const [answered, setAnswered] = useState<Answered | null>(null);

  useEffect(() => {
    if (!enabled || !client || !plan) return;
    const ctrl = new AbortController();
    const settle = (state: PrivateExplainState) => {
      if (!ctrl.signal.aborted) setAnswered({ plan, household, state });
    };
    whenPrepared()
      .then(() => client.explainPlanOnDevice(plan, household, ctrl.signal))
      .then(
        ({ why, engine }) => settle({ status: 'ready', why, engine }),
        (err: unknown) => settle({ status: 'error', message: messageOf(err) }),
      );
    return () => ctrl.abort();
  }, [enabled, client, whenPrepared, plan, household]);

  if (!enabled || !client || !plan) return { status: 'off' };
  if (answered?.plan === plan && answered.household === household) return answered.state;
  return { status: 'working' };
}
