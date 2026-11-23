import { Card, CardHeader } from '@/components/ui/primitives';
import { RoutineRow } from '@/components/routine';
import type { Member } from '@/lib/profile/schema';
import type { RoutineView } from './routineView';

interface UpgradesCardProps {
  view: RoutineView;
  members: Member[];
}

/** Actions that cost money or effort, listed apart so they never inflate today's totals. */
export function UpgradesCard({ view, members }: UpgradesCardProps) {
  return (
    <Card className="mt-6">
      <CardHeader
        title="Upgrades worth making"
        description="These cost money or effort, so they are kept out of today’s totals."
      />
      <ul className="border-t border-line">
        {view.upgrades.map((item) => (
          <RoutineRow
            key={item.id}
            item={item}
            members={members}
            why={view.why.get(item.id)}
            whyBy={view.writer}
          />
        ))}
      </ul>
    </Card>
  );
}
