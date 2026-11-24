/**
 * Hero card of the Overview: the scrubbable air column beside the AQI reading and what is
 * driving it, with a one-line outlook for the day underneath.
 */
import { Link } from 'wouter';
import { ArrowUpRight } from 'lucide-react';
import { Card, CardFooter } from '@/components/ui/primitives';
import type { AirSnapshot, AqiStandard } from '@/lib/air/types';
import type { PlanResult } from '@/lib/planner/engine';
import { AirColumnPreview } from './AirColumnPreview';
import { AirDetails } from './AirDetails';
import { ScrubControl } from './ScrubControl';
import type { ScrubbedHour } from './scrub';

interface AirNowCardProps {
  air: AirSnapshot;
  plan: PlanResult;
  scrub: ScrubbedHour;
  standard: AqiStandard;
  webgl: boolean;
  onScrub: (offset: number) => void;
}

/** Hero card: the scrubbable air column beside today's AQI and its drivers. */
export function AirNowCard({ air, plan, scrub, standard, webgl, onScrub }: AirNowCardProps) {
  return (
    <Card>
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="p-4 md:p-5">
          <AirColumnPreview scrub={scrub} webgl={webgl} />
          <ScrubControl scrub={scrub} onScrub={onScrub} />
        </div>
        <AirDetails air={air} plan={plan} scrub={scrub} standard={standard} />
      </div>
      <OutlookFooter plan={plan} />
    </Card>
  );
}

interface OutlookFooterProps {
  plan: PlanResult;
}

/** One-line outlook: the cleanest hour today and how long the smog lid stays down. */
function OutlookFooter({ plan }: OutlookFooterProps) {
  const { cleanWindow, lid } = plan;
  return (
    <CardFooter>
      <span>
        {cleanWindow ? (
          <>
            Cleanest hour today:{' '}
            <strong className="font-medium text-fg">{cleanWindow.start}</strong> at{' '}
            {cleanWindow.pm25} µg/m³
          </>
        ) : (
          'No clean window found in the next 24 hours'
        )}
        {lid.stagnantHours > 0 && <> · Smog lid for {lid.stagnantHours} of the next 24 h</>}
      </span>
      <Link
        href="/forecast"
        className="inline-flex items-center gap-1 font-medium text-fg hover:underline"
      >
        Open forecast <ArrowUpRight size={14} aria-hidden="true" />
      </Link>
    </CardFooter>
  );
}
