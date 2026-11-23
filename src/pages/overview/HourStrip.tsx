import { aqiVar } from '@/components/ui/primitives';
import type { HourPoint } from '@/lib/air/types';
import { cn } from '@/lib/cn';
import { fmtInt, hourLabel } from '@/lib/format';
import { isLidHour } from '@/lib/science/meteo';
import type { HourCell } from './scrub';

interface HourStripProps {
  cells: HourCell[];
  /** Index into the hourly series of the selected hour. */
  active: number;
  onPick: (cell: HourCell) => void;
}

function cellLabel(hour: HourPoint): string {
  const lid = isLidHour(hour) ? ', smog lid' : '';
  return `${hourLabel(hour.time)}, PM2.5 ${fmtInt(hour.pm25 ?? 0)}${lid}`;
}

/** Edge and middle time labels under the strip. */
function axisLabels(cells: HourCell[]): [string, string, string] {
  const at = (i: number) => {
    const cell = cells.at(i);
    return cell ? hourLabel(cell.hour.time) : '';
  };
  return [at(0), at(Math.floor(cells.length / 2)), at(-1)];
}

/** The next 24 hours as clickable AQI-coloured cells, hatched where a smog lid sits. */
export function HourStrip({ cells, active, onPick }: HourStripProps) {
  const [first, middle, last] = axisLabels(cells);
  return (
    <div className="mt-3">
      <div
        className="flex h-6 gap-[2px]"
        role="group"
        aria-label="Next 24 hours by air quality. Hatched hours are under a smog lid."
      >
        {cells.map((cell) => (
          <button
            key={cell.index}
            type="button"
            onClick={() => onPick(cell)}
            aria-label={cellLabel(cell.hour)}
            aria-pressed={cell.index === active}
            className={cn(
              'relative flex-1 rounded-[3px] transition-transform duration-150 hover:scale-y-110',
              cell.index === active && 'ring-2 ring-fg ring-offset-1 ring-offset-surface',
            )}
            style={{ background: aqiVar(cell.level) }}
          >
            {isLidHour(cell.hour) && (
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-[3px] bg-[repeating-linear-gradient(135deg,rgb(0_0_0/0.28)_0_2px,transparent_2px_5px)]"
              />
            )}
          </button>
        ))}
      </div>
      <div className="tabular mt-1 flex justify-between text-[11px] text-subtle">
        <span>{first}</span>
        <span>{middle}</span>
        <span>{last}</span>
      </div>
    </div>
  );
}
