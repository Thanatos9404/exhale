import { fmtHour, type LidSpan } from '../../science/meteo.js';
import { advice, freeAction, type ActionProposal, type PlanContext } from '../context.js';
import { fmtPm, hourSpan } from '../format.js';
import type { ScenarioChange } from '../scenario.js';

/** Advice driven by the meteorology itself: the smog lid and the cleanest hour to air out. */

/** Only move a habit when the new hour is at least 10% cleaner than the old one. */
const MEANINGFUL_DROP = 0.9;

/** The longest lid span; the first one wins a tie. */
function longestLid(lids: readonly LidSpan[]): LidSpan | null {
  let longest: LidSpan | null = null;
  for (const lid of lids) {
    if (!longest || lid.end - lid.start > longest.end - longest.start) longest = lid;
  }
  return longest;
}

/** Keep windows shut through the longest smog lid, when pollution piles up near the ground. */
export function lidAction(ctx: PlanContext): ActionProposal | null {
  const longest = longestLid(ctx.lids);
  if (!longest) return null;
  const t = hourSpan(ctx.hourly, longest.start, longest.end);
  return advice(
    {
      id: 'lid',
      kind: 'protect',
      status: 'avoid',
      time: t.start,
      endTime: t.end,
      title: `Keep windows shut ${t.start} to ${t.end}`,
      change: { before: 'Windows opened as usual', after: `Windows shut ${t.start} to ${t.end}` },
      detail: `A smog lid sits as low as ${Math.round(longest.minBlh)} m with light wind, so street emissions pile up near the ground instead of mixing away. Indoor air is cleaner than outdoor air during these hours only while windows stay closed.`,
    },
    ctx.everyone,
  );
}

/** Air the house at the cleanest afternoon hour instead of the usual one. */
export function ventilateAction(ctx: PlanContext): ActionProposal | null {
  const { clean, baseline, sim } = ctx;
  const habitIdx = baseline.airingIdx;
  if (!clean || habitIdx === null || clean.start === habitIdx) return null;
  const habitPm = sim.ambient(habitIdx);
  const worthMoving = clean.meanPm25 < habitPm * MEANINGFUL_DROP;
  if (!worthMoving) return null;

  const apply: ScenarioChange = (s) => {
    s.airingIdx = clean.start;
  };
  const t = hourSpan(ctx.hourly, clean.start, clean.end);
  const usual = fmtHour(ctx.household.home.airingHour);
  return freeAction(
    ctx,
    {
      id: 'ventilate',
      kind: 'ventilate',
      status: 'go',
      time: t.start,
      endTime: t.end,
      title: `Air out the house ${t.start} to ${t.end}, not at ${usual}`,
      change: {
        before: `Air out at ${usual} · ${fmtPm(habitPm)} outside`,
        after: `Air out ${t.start} to ${t.end} · ${fmtPm(clean.meanPm25)} outside`,
      },
      detail: `Outdoor PM2.5 is forecast at ${fmtPm(habitPm)} at ${usual} but ${fmtPm(clean.meanPm25)} at ${t.start}, when the afternoon sun lifts the mixing layer. Same fresh air, far fewer particles.`,
    },
    apply,
  );
}
