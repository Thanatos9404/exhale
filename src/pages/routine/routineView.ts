import type { AiPlan } from '@/lib/apiTypes';
import type { PlanResult, RoutineItem } from '@/lib/planner/engine';
import type { Deployment, LogLine, useDeployments } from '@/state/Deployments';

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

/** Picks the plan to show and splits it into free actions and paid upgrades. */
export function routineView(localPlan: PlanResult, latest: Deployment | null): RoutineView {
  const deployed = latest?.response;
  const plan = deployed?.plan ?? localPlan;
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
  return { dot: 'bg-line-strong', label: 'Not deployed', pulse: false };
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
