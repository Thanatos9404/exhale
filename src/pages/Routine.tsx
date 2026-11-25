/**
 * The Routine page: deploys today's plan, shows its build, and lists the actions for the
 * household and the bulletin for the neighbourhood. When Firebase is configured, the actions can
 * be explained privately by Gemini Nano on this device instead.
 */
import { ErrorCard, LoadingCard } from '@/components/states';
import { useLocalPlan } from '@/hooks/useAir';
import { usePrivateAi } from '@/hooks/usePrivateAi';
import { useAppState } from '@/state/AppState';
import { useDeployments } from '@/state/Deployments';
import { AiSummaryCard } from './routine/AiSummaryCard';
import { CommunityAdvisoryCard } from './routine/CommunityAdvisoryCard';
import { DeployBanner } from './routine/DeployBanner';
import { DeploymentCard } from './routine/DeploymentCard';
import { DeploymentHistory } from './routine/DeploymentHistory';
import { FreeActionsCard } from './routine/FreeActionsCard';
import { PrivateExplainCard } from './routine/PrivateExplainCard';
import { RoutineActions, RoutineLayout } from './routine/RoutineLayout';
import { routineView, shownPlan, withPrivateExplanations } from './routine/routineView';
import { TipsGrid } from './routine/TipsCard';
import { UpgradesCard } from './routine/UpgradesCard';
import { usePrivateExplanations } from './routine/usePrivateExplanations';

/** Routine page: deploy today's plan, follow the build, and work through the actions. */
export default function Routine() {
  const { household, place } = useAppState();
  const { plan: localPlan, isLoading, isError, error, refetch } = useLocalPlan();
  const { status, logs, latest, history, deploy, done, toggleDone } = useDeployments();
  const privateAi = usePrivateAi();
  // Hooks run before the loading and error returns, so the plan may not exist yet.
  const onScreen = localPlan ? shownPlan(localPlan, latest) : null;
  const explained = usePrivateExplanations(onScreen, household, privateAi);

  if (isError)
    return (
      <RoutineLayout>
        <ErrorCard
          message={error instanceof Error ? error.message : 'Unknown error'}
          onRetry={() => void refetch()}
        />
      </RoutineLayout>
    );
  if (isLoading || !localPlan)
    return (
      <RoutineLayout>
        <LoadingCard className="h-[420px]" />
      </RoutineLayout>
    );

  const view = withPrivateExplanations(routineView(localPlan, latest), explained);
  const building = status === 'building';
  const deployed = latest !== null;

  return (
    <RoutineLayout
      actions={
        <RoutineActions building={building} deployed={deployed} onDeploy={() => void deploy()} />
      }
    >
      <DeploymentCard
        status={status}
        logs={logs}
        latest={latest}
        place={latest?.placeLabel ?? view.plan.placeLabel}
      />
      {view.ai ? (
        <AiSummaryCard ai={view.ai} writer={view.writer} />
      ) : (
        <DeployBanner building={building} deployed={deployed} />
      )}
      <PrivateExplainCard controls={privateAi} state={explained} />
      <FreeActionsCard
        view={view}
        members={household.members}
        done={done}
        onToggleDone={toggleDone}
      />
      <CommunityAdvisoryCard
        plan={view.plan}
        place={{ label: view.plan.placeLabel, timezone: place.timezone }}
      />
      {view.upgrades.length > 0 && <UpgradesCard view={view} members={household.members} />}
      <TipsGrid view={view} />
      {history.length > 0 && <DeploymentHistory history={history} />}
    </RoutineLayout>
  );
}
