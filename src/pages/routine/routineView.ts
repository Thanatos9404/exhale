/**
 * View logic for the Routine page, kept free of JSX so it can be unit tested: which plan is on
 * screen (the deployed one, else the local one), how it splits into free actions and upgrades,
 * the wording for deployment status and providers, and how private on-device explanations
 * (Gemini Nano through Firebase AI Logic) replace the server's on screen.
 */
import type { AiEngine, AiPlan } from '@/lib/apiTypes';
import type { PlanResult, RoutineItem } from '@/lib/planner/engine';
import type { Deployment, LogLine, useDeployments } from '@/state/Deployments';
import type { PrivateAiChoice } from '@/state/privateAiChoice';
import type { PrivateExplainState } from './usePrivateExplanations';

/** Lifecycle of the current deployment run. */
export type DeployStatus = ReturnType<typeof useDeployments>['status'];

/** What the routine page renders: the deployed plan when there is one, else the local plan. */
export interface RoutineView {
  plan: PlanResult;
  ai: AiPlan | null;
  /** AI explanation per routine item id. */
  why: Map<string, string>;
  /** Display name of the model that wrote the explanations. */
  writer: string;
  free: RoutineItem[];
  upgrades: RoutineItem[];
}

/** The plan on screen: the deployed one when there is one, else the one computed here. */
export function shownPlan(localPlan: PlanResult, latest: Deployment | null): PlanResult {
  return latest?.response.plan ?? localPlan;
}

/** Picks the plan to show and splits it into free actions and paid upgrades. */
export function routineView(localPlan: PlanResult, latest: Deployment | null): RoutineView {
  const deployed = latest?.response;
  const plan = shownPlan(localPlan, latest);
  const ai = deployed?.ai ?? null;
  return {
    plan,
    ai,
    why: new Map(ai?.items.map((i) => [i.id, i.why]) ?? []),
    writer: deployed?.source === 'claude' ? 'Claude Haiku' : 'Gemini',
    free: plan.items.filter((i) => i.freeAction),
    upgrades: plan.items.filter((i) => !i.freeAction),
  };
}

/** Text for the primary deploy button. */
export function deployButtonLabel(building: boolean, deployed: boolean): string {
  if (building) return 'Deploying…';
  return deployed ? 'Redeploy with Gemini' : 'Deploy with Gemini';
}

/** Dot colour, label and pulse for the deployment status readout. */
export interface StatusIndicator {
  dot: string;
  label: string;
  pulse: boolean;
}

/** Maps the run status, and whether anything has been deployed yet, to a status readout. */
export function statusIndicator(status: DeployStatus, latestAt: string | null): StatusIndicator {
  if (status === 'building') return { dot: 'bg-amber', label: 'Building', pulse: true };
  if (status === 'error') return { dot: 'bg-red', label: 'Error', pulse: false };
  if (latestAt) return { dot: 'bg-green', label: 'Ready', pulse: false };
  return { dot: 'bg-field-border', label: 'Not deployed', pulse: false };
}

/** Provider that wrote a deployment's explanations, named by model id when the API reported one. */
export function providerLabel(source: Deployment['source'], model: string | null): string {
  switch (source) {
    case 'gemini':
      return model ?? 'Gemini';
    case 'claude':
      return model ?? 'Claude Haiku';
    case 'rules':
      return 'Rules engine';
  }
}

/** Who wrote the latest explanations, as shown in the deployment summary. */
export function explainedByLabel(
  source: Deployment['source'] | null,
  model: string | null,
): string {
  return source ? providerLabel(source, model) : 'Not yet';
}

/** Model column for a row in the deployment history. */
export function historySourceLabel(deployment: Deployment): string {
  return providerLabel(deployment.source, deployment.model);
}

/** Text colour for each kind of build log line. */
export const LOG_TEXT_CLASS: Record<LogLine['kind'], string> = {
  info: 'text-fg',
  ok: 'text-fg',
  warn: 'text-amber',
  error: 'text-red',
  ai: 'text-blue',
};

/** Who wrote a private explanation, as the routine rows credit it. */
export const ENGINE_WRITER: Record<AiEngine, string> = {
  'on-device': 'Gemini Nano, on this device',
  cloud: 'Gemini via Firebase',
};

/**
 * The view with private explanations in place of the server's once they are ready. Only the
 * wording changes: every number on screen still comes from the engine's plan.
 */
export function withPrivateExplanations(
  view: RoutineView,
  state: PrivateExplainState,
): RoutineView {
  if (state.status !== 'ready') return view;
  return { ...view, why: state.why, writer: ENGINE_WRITER[state.engine] };
}

/** The live status line under the private-explanations switch. */
export function privateStatusText(choice: PrivateAiChoice, state: PrivateExplainState): string {
  if (!choice.enabled) return 'Off. Explanations come from the server when you deploy.';
  if (choice.preparing !== null)
    return `Getting Gemini Nano ready on this device: ${Math.round(choice.preparing * 100)}%.`;
  switch (state.status) {
    case 'off':
    case 'working':
      return 'Writing your explanations privately…';
    case 'error':
      return `Private explanations failed (${state.message}). The usual explanations are shown.`;
    case 'ready':
      return state.engine === 'on-device'
        ? 'Explained by Gemini Nano on this device. Your household details did not leave it.'
        : 'Gemini Nano is not available in this browser, so Firebase explained the plan with cloud Gemini.';
  }
}
