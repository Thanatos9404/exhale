import { Card, CardHeader } from '@/components/ui/primitives';
import { InversionDiagram } from '@/components/InversionDiagram';
import type { HourPoint } from '@/lib/air/types';
import { dispersionClass, ventilationCoefficient } from '@/lib/science/meteo';

/** Mixing height shown when the model has no boundary-layer reading, metres. */
const DEFAULT_BLH = 800;

interface SmogLidCardProps {
  now: HourPoint;
}

/** Explains the winter inversion with a diagram driven by the current mixing height and wind. */
export function SmogLidCard({ now }: SmogLidCardProps) {
  const vc = ventilationCoefficient(now.blh, now.wind);
  return (
    <Card>
      <CardHeader
        title="Why is it so smoggy?"
        description="Winter nights trap emissions under a lid of warm air."
      />
      <div className="px-5 pb-5">
        <InversionDiagram
          blh={now.blh ?? DEFAULT_BLH}
          wind={now.wind ?? 0}
          vc={vc}
          dispersion={dispersionClass(vc)}
        />
      </div>
    </Card>
  );
}
