/**
 * The "What Exhale knows" card beside the chat. It lists the model and every piece of context
 * sent with a question, so people can see what the assistant is working from.
 */
import type { ReactNode } from 'react';
import { Badge, Card, CardHeader, Dot } from '@/components/ui/primitives';
import { useHealth } from '@/hooks/useAir';
import type { Place } from '@/lib/air/types';
import type { PlanResult } from '@/lib/planner/engine';
import type { Household } from '@/lib/profile/schema';
import { airNowText, cleanHourText, planText, smogLidText } from './context';

interface KnowledgeCardProps {
  place: Place;
  household: Household;
  plan: PlanResult | null;
}

/** "What Exhale knows": the model and every piece of context sent with a question. */
export function KnowledgeCard({ place, household, plan }: KnowledgeCardProps) {
  const health = useHealth();
  const aiOn = health.data?.ai === true;
  return (
    <Card className="h-fit">
      <CardHeader
        title="What Exhale knows"
        description="Sent with your question, used only to answer it. Nothing is stored on a server."
      />
      <dl className="space-y-3 px-5 pb-5 text-[13px]">
        <Row
          label="Model"
          value={
            <span className="inline-flex items-center gap-1.5">
              <Dot className={aiOn ? 'bg-green' : 'bg-amber'} />
              {aiOn ? health.data?.model : 'Rules engine (no Gemini key)'}
            </span>
          }
        />
        <Row label="Place" value={place.label} />
        {plan && (
          <>
            <Row label="Air now" value={airNowText(plan)} />
            <Row label="Smog lid" value={smogLidText(plan)} />
            <Row label="Cleanest hour" value={cleanHourText(plan)} />
            <Row label="Plan" value={planText(plan)} />
          </>
        )}
        <Row
          label="Household"
          value={
            <span className="flex flex-wrap gap-1">
              {household.members.map((m) => (
                <Badge key={m.id}>
                  {m.name} · {m.ageGroup}
                  {m.conditions.length ? `, ${m.conditions.join(', ')}` : ''}
                </Badge>
              ))}
            </span>
          }
        />
      </dl>
    </Card>
  );
}

interface RowProps {
  label: string;
  value: ReactNode;
}

function Row({ label, value }: RowProps) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-fg">{value}</dd>
    </div>
  );
}
