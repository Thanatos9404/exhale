import type { ReactNode } from 'react';
import { Leaf, Wind } from 'lucide-react';
import { Badge, Card, CardHeader } from '@/components/ui/primitives';
import type { AiTip } from '@/lib/apiTypes';
import { CURATED_HACKS, CURATED_SWAPS } from './curatedTips';
import type { RoutineView } from './routineView';

interface TipsGridProps {
  view: RoutineView;
}

/** Indoor hacks and sustainable swaps side by side: AI-tailored when available, curated otherwise. */
export function TipsGrid({ view }: TipsGridProps) {
  const { ai } = view;
  const source = ai ? view.writer : null;
  return (
    <div className="mt-6 grid gap-6 md:grid-cols-2">
      <TipsCard
        title="Indoor air hacks"
        icon={<Wind size={15} aria-hidden="true" />}
        tips={ai?.indoorHacks ?? CURATED_HACKS}
        ai={source}
      />
      <TipsCard
        title="Sustainable swaps"
        icon={<Leaf size={15} aria-hidden="true" />}
        tips={ai?.sustainableSwaps ?? CURATED_SWAPS}
        ai={source}
      />
    </div>
  );
}

interface TipsCardProps {
  title: string;
  icon: ReactNode;
  tips: AiTip[];
  /** Model that wrote the tips, or null for the curated set. */
  ai: string | null;
}

/** A titled list of tips, badged with who wrote them. */
export function TipsCard({ title, icon, tips, ai }: TipsCardProps) {
  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            {icon} {title}
          </span>
        }
        action={<Badge tone={ai ? 'blue' : 'neutral'}>{ai ?? 'Curated'}</Badge>}
      />
      <ul className="space-y-3 px-5 pb-5">
        {tips.map((t) => (
          <li key={t.title} className="rounded-lg border border-line p-3">
            <p className="text-sm font-medium text-fg">{t.title}</p>
            <p className="mt-1 text-[13px] text-muted">{t.detail}</p>
            <p className="mt-2 text-xs font-medium text-green">{t.impact}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
