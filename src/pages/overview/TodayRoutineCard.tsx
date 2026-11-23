import { Link } from 'wouter';
import { Card, CardHeader } from '@/components/ui/primitives';
import { RoutineRow } from '@/components/routine';
import { relativeTime } from '@/lib/format';
import type { PlanResult } from '@/lib/planner/engine';
import { useAppState } from '@/state/AppState';
import { useDeployments, type Deployment } from '@/state/Deployments';

/** Rows shown before the "View all" link takes over. */
const PREVIEW_ROWS = 5;

/** Says who explained the routine, or that nobody has yet. */
const WRITER_NAME: Record<Deployment['source'], string> = {
  gemini: 'Gemini',
  claude: 'Claude Haiku',
  rules: 'the rules engine',
};

function explanationNote(latest: Deployment | null): string {
  if (!latest) return 'Live from the planning engine. Deploy to add Gemini’s explanations.';
  const by = WRITER_NAME[latest.source];
  return `Explained by ${by} ${relativeTime(latest.at)}`;
}

interface TodayRoutineCardProps {
  plan: PlanResult;
}

/** The top of today's routine, with the latest deployment's explanations and done ticks. */
export function TodayRoutineCard({ plan }: TodayRoutineCardProps) {
  const { household } = useAppState();
  const { latest, done, toggleDone } = useDeployments();
  const why = new Map(latest?.response.ai?.items.map((i) => [i.id, i.why]) ?? []);
  return (
    <Card>
      <CardHeader
        title="Today’s routine"
        description={explanationNote(latest)}
        action={
          <Link href="/routine" className="text-[13px] font-medium text-fg hover:underline">
            View all {plan.items.length}
          </Link>
        }
      />
      <ul className="border-t border-line">
        {plan.items.slice(0, PREVIEW_ROWS).map((item) => (
          <RoutineRow
            key={item.id}
            item={item}
            members={household.members}
            why={why.get(item.id)}
            done={done.has(item.id)}
            onToggleDone={() => toggleDone(item.id)}
            compact
          />
        ))}
      </ul>
    </Card>
  );
}
