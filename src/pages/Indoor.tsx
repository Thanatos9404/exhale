import { RotateCcw } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/shell/Shell';
import { Button } from '@/components/ui/Button';
import { useAir } from '@/hooks/useAir';
import { useAppState } from '@/state/AppState';
import { QuickWins } from './indoor/QuickWins';
import { RoomReadout } from './indoor/RoomReadout';
import { RoomSettings } from './indoor/RoomSettings';
import { quickWins, simulate } from './indoor/room';
import { useRoom } from './indoor/useRoom';

/** Outdoor PM2.5 assumed until live data arrives, µg/m³. */
const FALLBACK_OUTDOOR = 120;

/** The indoor lab: a one-room physics model seeded from the household's home and live air. */
export default function Indoor() {
  const { household } = useAppState();
  const air = useAir();
  const live = Math.round(air.data?.current.pm25 ?? FALLBACK_OUTDOOR);
  const { room, update, replace, reset } = useRoom(household.home, live);
  const result = simulate(room);
  const wins = quickWins(room, result.indoorPm25);

  return (
    <>
      <PageHeader
        title="Indoor lab"
        description="A physics model of one room. Change anything and watch what happens to the air your family breathes for most of the day."
        actions={
          <Button leading={<RotateCcw size={14} aria-hidden="true" />} onClick={reset}>
            Reset to my home
          </Button>
        }
      />
      <PageBody>
        <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
          <RoomSettings room={room} liveOutdoor={live} onChange={update} />
          <div className="flex flex-col gap-6">
            <RoomReadout room={room} result={result} standard={household.standard} />
            <QuickWins wins={wins} current={result.indoorPm25} onApply={replace} />
          </div>
        </div>
      </PageBody>
    </>
  );
}
