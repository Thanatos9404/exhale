/**
 * Hand-written indoor tips and sustainable swaps for when no AI wording is available. They are
 * general and conservative on purpose, because nothing here is tailored to the household.
 */
import type { AiTip } from '@/lib/apiTypes';

/** Curated, conservative indoor tips shown when no AI explanation is available. */
export const CURATED_HACKS: AiTip[] = [
  {
    title: 'Wet-mop, do not sweep',
    detail:
      'Sweeping throws settled dust back into the air. A damp mop or cloth captures it instead.',
    impact: 'Less resuspended dust indoors on smoggy days',
  },
  {
    title: 'Seal the gaps under doors and windows',
    detail: 'Draught strips and a rolled towel slow outdoor air leaking in while the lid is down.',
    impact: 'Lower indoor share of outdoor smog during lid hours',
  },
  {
    title: 'Keep one clean room',
    detail:
      'Pick the bedroom, keep its door shut and run any filter there. Sleep is a third of the day.',
    impact: 'Concentrates filtration where you breathe longest',
  },
];

/** Curated swaps that cut what the household adds to the air, shown without AI. */
export const CURATED_SWAPS: AiTip[] = [
  {
    title: 'Report open burning',
    detail:
      'Leaf, garbage and crop burning add directly to the night-time lid. Report it to your city or state pollution board.',
    impact: 'Removes a source the whole street breathes',
  },
  {
    title: 'Club errands into one trip',
    detail:
      'One combined trip in the clean afternoon window replaces several short drives at peak hours.',
    impact: 'Fewer cold starts, which are the dirtiest part of a drive',
  },
  {
    title: 'Switch off idling engines',
    detail:
      'At signals and school gates, a parked engine adds exhaust exactly where children wait.',
    impact: 'Lower NO₂ and particles at kerbside',
  },
];
