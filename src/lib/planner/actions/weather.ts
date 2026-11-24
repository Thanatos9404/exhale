/** Advice driven by the meteorology itself: the smog lid and the cleanest hour to air out. */
import { fmtHour, type LidSpan } from '../../science/meteo.js';
import {
  advice,
  AIRING_WINDOW,
  freeAction,
  type ActionProposal,
  type PlanContext,
} from '../context.js';
import { fmtPm, hourAt, hourSpan } from '../format.js';
import { firstSafe } from '../guard.js';
import type { ScenarioChange } from '../scenario.js';

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

/** Hours in the airing window meaningfully cleaner than the usual hour, cleanest first. */
function cleanerAiringHours(ctx: PlanContext, habitPm: number): number[] {
  const { sim, hourly } = ctx;
  const hours: number[] = [];
  for (let i = sim.from; i < sim.to; i++) {
    const hod = hourAt(hourly, i);
    const inWindow = hod >= AIRING_WINDOW.dayStart && hod <= AIRING_WINDOW.dayEnd;
    // A missing reading is not proof of clean air, so that hour is never proposed.
    const known = typeof hourly[i]?.pm25 === 'number';
    if (inWindow && known && sim.ambient(i) < habitPm * MEANINGFUL_DROP) hours.push(i);
  }
  return hours.sort((a, b) => sim.ambient(a) - sim.ambient(b));
}

function airAt(ctx: PlanContext, habitPm: number, idx: number): ActionProposal {
  const apply: ScenarioChange = (s) => {
    s.airingIdx = idx;
  };
  const pm = fmtPm(ctx.sim.ambient(idx));
  const t = hourSpan(ctx.hourly, idx, idx + 1);
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
        after: `Air out ${t.start} to ${t.end} · ${pm} outside`,
      },
      detail: `Outdoor PM2.5 is forecast at ${fmtPm(habitPm)} at ${usual} but ${pm} at ${t.start}, when the afternoon sun lifts the mixing layer. Same fresh air, far fewer particles.`,
    },
    apply,
  );
}

/**
 * Air the house at the cleanest afternoon hour instead of the usual one. Opening the windows
 * raises indoor PM2.5 for whoever is home that hour, so the cleanest hour can still cost
 * someone who was out at the usual one: the cleanest hour that harms nobody is proposed.
 */
export function ventilateAction(ctx: PlanContext): ActionProposal | null {
  const habitIdx = ctx.baseline.airingIdx;
  if (habitIdx === null) return null;
  const habitPm = ctx.sim.ambient(habitIdx);
  return firstSafe(ctx, cleanerAiringHours(ctx, habitPm), (idx) => airAt(ctx, habitPm, idx));
}
