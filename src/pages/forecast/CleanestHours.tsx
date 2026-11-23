import { Card, CardHeader } from '@/components/ui/primitives';
import type { HourPoint } from '@/lib/air/types';
import { isLidHour } from '@/lib/science/meteo';
import { fmtInt } from '@/lib/format';
import { cleanestHours, weekdayLabel } from './series';

/** How many of the cleanest upcoming hours to list. */
const SHOWN = 6;

interface CleanestHoursProps {
  /** The next day of hours, starting now. */
  upcoming: readonly HourPoint[];
}

/** The lowest-PM2.5 hours of the next day, with bars scaled to the worst hour. */
export function CleanestHours({ upcoming }: CleanestHoursProps) {
  const cleanest = cleanestHours(upcoming, SHOWN);
  const worstPm = Math.max(...upcoming.map((h) => h.pm25 ?? 0), 1);
  return (
    <Card>
      <CardHeader
        title="Cleanest hours ahead"
        description="Best times to air the house, exercise or run errands."
      />
      <ol className="space-y-1 px-3 pb-4">
        {cleanest.map((h) => (
          <li
            key={h.time}
            className="relative flex h-9 items-center justify-between overflow-hidden rounded-md px-2 text-[13px]"
          >
            <span
              aria-hidden="true"
              className="absolute inset-y-1 left-1 rounded-[4px] bg-green opacity-15"
              style={{ width: `${(h.pm25 / worstPm) * 96}%` }}
            />
            <span className="tabular relative font-medium text-fg">
              {weekdayLabel(h.time)} {h.time.slice(11, 16)}
            </span>
            <span className="tabular relative text-muted">
              {fmtInt(h.pm25)} µg/m³{isLidHour(h) ? ' · lid' : ''}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
