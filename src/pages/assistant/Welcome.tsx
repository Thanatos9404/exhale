import { Globe } from 'lucide-react';
import { ParticleOrb } from '@/components/ParticleOrb';
import type { PlanResult } from '@/lib/planner/engine';
import { airSummary, type Suggestion } from './context';

interface WelcomeProps {
  plan: PlanResult | null;
  suggestions: readonly Suggestion[];
  onAsk: (suggestion: Suggestion) => void;
}

/** The empty conversation: a short air summary and starter questions. */
export function Welcome({ plan, suggestions, onAsk }: WelcomeProps) {
  return (
    <div className="mx-auto flex max-w-[560px] flex-col items-center pt-6 text-center">
      <div className="text-fg">
        <ParticleOrb size={72} active />
      </div>
      <h2 className="mt-4 text-xl font-semibold tracking-[-0.02em] text-fg">Ask about your air</h2>
      <p className="mt-1 text-[13px] text-muted">
        {airSummary(plan)} I know your household and today’s plan.
      </p>
      <ul className="mt-6 grid w-full gap-2 sm:grid-cols-2">
        {suggestions.map((s) => (
          <li key={s.q}>
            <button
              type="button"
              onClick={() => onAsk(s)}
              className="press flex h-full w-full items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 text-left text-[13px] text-fg transition-colors hover:bg-hover"
            >
              {s.search && (
                <Globe
                  size={13}
                  aria-label="Uses web search"
                  className="mt-0.5 shrink-0 text-blue"
                />
              )}
              {s.q}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
