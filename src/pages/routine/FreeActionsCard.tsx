import { Link } from 'wouter';
import { ChevronRight } from 'lucide-react';
import { Badge, Card, CardFooter, CardHeader } from '@/components/ui/primitives';
import { RoutineRow } from '@/components/routine';
import { fmtCig, fmtDec, fmtDose } from '@/lib/format';
import type { PlanResult } from '@/lib/planner/engine';
import type { Member } from '@/lib/profile/schema';
import type { RoutineView } from './routineView';

interface FreeActionsCardProps {
  view: RoutineView;
  members: Member[];
  done: Set<string>;
  onToggleDone: (id: string) => void;
}

/** Today's free actions as a checklist, with their combined impact in the footer. */
export function FreeActionsCard({ view, members, done, onToggleDone }: FreeActionsCardProps) {
  const { plan, free, why, writer, ai } = view;
  const doneCount = free.filter((i) => done.has(i.id)).length;
  const allDone = doneCount === free.length && free.length > 0;
  return (
    <Card className="mt-6">
      <CardHeader
        title="Free actions"
        description={`${plan.horizon.start} to ${plan.horizon.end}, sorted by how much they cut your family’s dose.`}
        action={
          <Badge tone={allDone ? 'green' : 'neutral'}>
            {doneCount}/{free.length} done
          </Badge>
        }
      />
      <div className="hidden grid-cols-[120px_64px_minmax(0,1fr)_auto_150px_36px] gap-4 border-t border-line bg-surface-2 px-5 py-2 text-xs font-medium text-subtle md:grid">
        <span>Status</span>
        <span>Time</span>
        <span>Action</span>
        <span>For</span>
        <span>Impact today</span>
        <span className="sr-only">Done</span>
      </div>
      <ul className="border-t border-line">
        {free.map((item, i) => (
          <RoutineRow
            key={item.id}
            item={item}
            members={members}
            why={why.get(item.id)}
            whyBy={writer}
            done={done.has(item.id)}
            onToggleDone={() => onToggleDone(item.id)}
            defaultOpen={i === 0 && Boolean(ai)}
          />
        ))}
      </ul>
      <TotalsFooter totals={plan.totals} />
    </Card>
  );
}

interface TotalsFooterProps {
  totals: PlanResult['totals'];
}

/** Sum of every free action: dose cut, cigarettes avoided and carbon saved. */
function TotalsFooter({ totals }: TotalsFooterProps) {
  return (
    <CardFooter>
      <span>
        All free actions together:{' '}
        <strong className="font-semibold text-fg">−{Math.round(totals.exposureCutPct)}%</strong>{' '}
        dose, {fmtDose(totals.baselineDoseUg - totals.optimizedDoseUg)} and{' '}
        {fmtCig(totals.cigarettesAvoided)} cigarette-equivalents avoided,{' '}
        {fmtDec(totals.co2SavedKgWeek, 1)} kg CO₂e saved a week
      </span>
      <Link
        href="/impact"
        className="inline-flex items-center gap-1 font-medium text-fg hover:underline"
      >
        See the impact <ChevronRight size={14} aria-hidden="true" />
      </Link>
    </CardFooter>
  );
}
