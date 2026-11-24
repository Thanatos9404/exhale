/**
 * History list at the foot of the Routine page: the recent deployments, newest first, with the
 * one on screen marked as current. The list lives in this browser only.
 */
import { Badge, Card, CardHeader, Dot } from '@/components/ui/primitives';
import { relativeTime } from '@/lib/format';
import type { Deployment } from '@/state/Deployments';
import { historySourceLabel } from './routineView';

interface DeploymentHistoryProps {
  history: Deployment[];
}

/** Recent deployments, newest first, kept only in this browser. */
export function DeploymentHistory({ history }: DeploymentHistoryProps) {
  return (
    <Card className="mt-6">
      <CardHeader
        title="Deployments"
        description="Your recent plans, stored only in this browser."
      />
      <ul className="border-t border-line">
        {history.map((deployment, i) => (
          <DeploymentRow key={deployment.id} deployment={deployment} current={i === 0} />
        ))}
      </ul>
    </Card>
  );
}

interface DeploymentRowProps {
  deployment: Deployment;
  /** The newest deployment, whose plan the page is showing. */
  current: boolean;
}

/** One past deployment: place, model, dose cut and age. */
function DeploymentRow({ deployment, current }: DeploymentRowProps) {
  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-line px-5 py-3 text-[13px] last:border-b-0 md:grid-cols-[110px_minmax(0,1fr)_140px_120px_90px]">
      <span className="inline-flex items-center gap-2 font-medium text-fg">
        <Dot className="bg-green" /> Ready
      </span>
      <span className="truncate text-fg">
        {deployment.placeLabel}
        {current && (
          <Badge tone="blue" className="ml-2">
            Current
          </Badge>
        )}
      </span>
      <span className="hidden text-muted md:block">{historySourceLabel(deployment)}</span>
      <span className="tabular hidden text-muted md:block">
        −{Math.round(deployment.cutPct)}% dose
      </span>
      <span className="text-right text-subtle">{relativeTime(deployment.at)}</span>
    </li>
  );
}
