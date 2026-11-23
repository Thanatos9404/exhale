import { fmtInt } from '@/lib/format';
import { HourStrip } from './HourStrip';
import type { ScrubbedHour } from './scrub';

interface ScrubControlProps {
  scrub: ScrubbedHour;
  /** Called with the number of hours ahead of now to show. */
  onScrub: (offset: number) => void;
}

/** Range slider plus hour strip for moving the air column through the coming hours. */
export function ScrubControl({ scrub, onScrub }: ScrubControlProps) {
  const pm25 = fmtInt(scrub.pm25);
  const blh = fmtInt(scrub.hour.blh ?? 0);
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
        <label htmlFor="scrub" className="font-medium">
          Scrub the next {scrub.maxOffset + 1} hours
        </label>
        <span className="tabular">
          {scrub.label} · {pm25} µg/m³
        </span>
      </div>
      <input
        id="scrub"
        type="range"
        min={0}
        max={scrub.maxOffset}
        step={1}
        value={scrub.offset}
        onChange={(e) => onScrub(Number(e.target.value))}
        aria-valuetext={`${scrub.label}: PM2.5 ${pm25} micrograms per cubic metre, mixing height ${blh} metres`}
        className="w-full"
      />
      <HourStrip cells={scrub.cells} active={scrub.index} onPick={(cell) => onScrub(cell.offset)} />
    </div>
  );
}
