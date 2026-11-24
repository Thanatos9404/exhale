/**
 * Deployment summary at the top of the Routine page: status, who explained the plan, where it is
 * for and when it was deployed, with the build log underneath. It only presents; the labels come
 * from ./routineView.
 */
import { Card, Dot } from '@/components/ui/primitives';
import { relativeTime } from '@/lib/format';
import type { Deployment, LogLine } from '@/state/Deployments';
import { BuildLogs } from './BuildLogs';
import { explainedByLabel, statusIndicator, type DeployStatus } from './routineView';

interface DeploymentCardProps {
  status: DeployStatus;
  logs: LogLine[];
  latest: Deployment | null;
  /** Place the routine is planned for. */
  place: string;
}

/** Vercel-style deployment summary for the routine, with its build log underneath. */
export function DeploymentCard({ status, logs, latest, place }: DeploymentCardProps) {
  const latestAt = latest?.at ?? null;
  const state = statusIndicator(status, latestAt);
  return (
    <Card>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 p-5 md:grid-cols-4">
        <div>
          <dt className="text-[13px] text-muted">Status</dt>
          <dd
            className="mt-1 inline-flex items-center gap-2 text-sm font-medium text-fg"
            aria-live="polite"
          >
            <Dot className={state.dot} pulse={state.pulse} /> {state.label}
          </dd>
        </div>
        <div>
          <dt className="text-[13px] text-muted">Explained by</dt>
          <dd className="mt-1 text-sm font-medium text-fg">
            {explainedByLabel(latest?.source ?? null, latest?.model ?? null)}
          </dd>
        </div>
        <div>
          <dt className="text-[13px] text-muted">Location</dt>
          <dd className="mt-1 truncate text-sm font-medium text-fg">{place}</dd>
        </div>
        <div>
          <dt className="text-[13px] text-muted">Deployed</dt>
          <dd className="mt-1 text-sm font-medium text-fg">
            {latestAt ? relativeTime(latestAt) : 'Never'}
          </dd>
        </div>
      </dl>
      <BuildLogs logs={logs} building={status === 'building'} failed={status === 'error'} />
    </Card>
  );
}
