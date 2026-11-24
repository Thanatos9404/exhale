/**
 * Quick wins card of the indoor lab: single changes ranked by the indoor PM2.5 they would leave,
 * each applied with one click. The ranking comes from ./room; this card only lists it.
 */
import { Card, CardHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { fmtInt } from '@/lib/format';
import { cutPercent, type QuickWin, type Room } from './room';

interface QuickWinsProps {
  wins: readonly QuickWin[];
  /** Indoor PM2.5 with the current settings, µg/m³. */
  current: number;
  onApply: (room: Room) => void;
}

/** Single changes ranked by the indoor PM2.5 they leave, each with a one-click Apply. */
export function QuickWins({ wins, current, onApply }: QuickWinsProps) {
  return (
    <Card>
      <CardHeader
        title="Quick wins for this room"
        description="Each change on its own, ranked by the indoor PM2.5 it leaves you with."
      />
      {wins.length === 0 ? (
        <p className="px-5 pb-5 text-[13px] text-muted">
          This room is already set up as well as the model allows. Keep the door shut and the filter
          running.
        </p>
      ) : (
        <ul className="border-t border-line">
          {wins.map((w) => (
            <li
              key={w.label}
              className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3 last:border-b-0"
            >
              <span className="min-w-0 flex-1 text-sm font-medium text-fg">{w.label}</span>
              <span className="tabular text-[13px] text-muted">
                {fmtInt(current)} →{' '}
                <strong className="font-semibold text-fg">{fmtInt(w.after)}</strong> µg/m³
              </span>
              <span className="tabular w-14 text-right text-[13px] font-medium text-green">
                −{fmtInt(cutPercent(current, w.after))}%
              </span>
              <Button size="sm" variant="tertiary" onClick={() => onApply(w.next)}>
                Apply
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
