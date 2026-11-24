/**
 * Summary card for a deployed routine: the model's own headline and summary, credited to the
 * model that wrote them. The page renders it only when a deployment returned AI wording, and
 * shows DeployBanner in its place otherwise.
 */
import { Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/primitives';
import type { AiPlan } from '@/lib/apiTypes';

interface AiSummaryCardProps {
  ai: AiPlan;
  /** Display name of the model that wrote the summary. */
  writer: string;
}

/** The AI-written headline and summary for today's plan, plus a note for the most sensitive. */
export function AiSummaryCard({ ai, writer }: AiSummaryCardProps) {
  return (
    <Card className="mt-6">
      <div className="p-5">
        <div className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-blue">
          <Sparkles size={13} aria-hidden="true" /> Written by {writer} from your live data
        </div>
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-fg">{ai.headline}</h2>
        <p className="mt-2 max-w-[75ch] text-[15px] text-muted">{ai.summary}</p>
        {ai.familyNote && (
          <p className="mt-3 max-w-[75ch] rounded-lg border border-line bg-surface-2 p-3 text-[13px] text-fg">
            <strong className="font-medium">For the most sensitive: </strong>
            {ai.familyNote}
          </p>
        )}
      </div>
    </Card>
  );
}
