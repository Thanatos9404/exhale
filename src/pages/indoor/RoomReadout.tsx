import { AqiStatus, Card, CardFooter, aqiVar } from '@/components/ui/primitives';
import { RoomParticles } from '@/components/RoomParticles';
import type { AqiStandard } from '@/lib/air/types';
import { cigarettesPerDay } from '@/lib/science/exposure';
import type { RoomResult } from '@/lib/science/indoor';
import { fmtCig, fmtDec, fmtInt } from '@/lib/format';
import { indoorCategory, type Room } from './room';

/** The room settles within about three time constants. */
const SETTLE_TIME_CONSTANTS = 3;

interface RoomReadoutProps {
  room: Room;
  result: RoomResult;
  standard: AqiStandard;
}

/** The simulated room: particle view, indoor PM2.5 with its AQI category, and what it means. */
export function RoomReadout({ room, result, standard }: RoomReadoutProps) {
  const cat = indoorCategory(result.indoorPm25, standard);
  return (
    <Card>
      <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="relative h-[280px] border-b border-line md:h-auto md:border-r md:border-b-0">
          <div className="absolute inset-4">
            <RoomParticles
              indoor={result.indoorPm25}
              windowsOpen={room.windowsOpen}
              purifierOn={room.purifier !== 'none'}
              sourceOn={room.sources.size > 0}
            />
          </div>
        </div>
        <dl className="space-y-4 p-5" aria-live="polite">
          <div>
            <dt className="text-[13px] text-muted">Indoor PM2.5</dt>
            <dd className="mt-1 flex items-baseline gap-2">
              <span
                className="tabular text-[40px] leading-none font-semibold tracking-[-0.04em]"
                style={{ color: aqiVar(cat.level) }}
              >
                {fmtInt(result.indoorPm25)}
              </span>
              <span className="text-sm text-muted">µg/m³</span>
            </dd>
            <dd className="mt-2">
              <AqiStatus level={cat.level} label={cat.label} />
            </dd>
          </div>
          <div>
            <dt className="text-[13px] text-muted">Compared with outdoors</dt>
            <dd className="tabular mt-1 text-sm font-medium text-fg">
              {room.outdoor > 0 ? `${fmtInt(result.ratio * 100)}% of outdoor air` : 'n/a'}
            </dd>
          </div>
          <div>
            <dt className="text-[13px] text-muted">Settles in about</dt>
            <dd className="tabular mt-1 text-sm font-medium text-fg">
              {fmtInt(result.timeConstantMin * SETTLE_TIME_CONSTANTS)} min
            </dd>
          </div>
          <div>
            <dt className="text-[13px] text-muted">A full day in this air</dt>
            <dd className="tabular mt-1 text-sm font-medium text-fg">
              {fmtCig(cigarettesPerDay(result.indoorPm25))} cigarettes
            </dd>
          </div>
        </dl>
      </div>
      <CardFooter>
        <span>
          Window on the left edge, purifier bottom right. Model: C<sub>in</sub> = (P·a·C
          <sub>out</sub> + S/V) / (a + k + CADR/V), {fmtInt(result.volumeM3)} m³,{' '}
          {fmtDec(result.purifierAch, 1)} clean-air changes an hour
        </span>
      </CardFooter>
    </Card>
  );
}
