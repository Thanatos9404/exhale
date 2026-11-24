/** Turns two simulated days into the impact figures a recommendation or a plan reports. */
import { cigarettesFromConcHours } from '../science/exposure.js';
import { round } from './format.js';
import type { HouseholdExposure } from './simulator.js';
import type { Impact } from './types.js';

/** A zero impact, for advice that confirms a habit or protects against something not modelled. */
export function noImpact(): Impact {
  return { doseSavedUg: 0, exposureCutPct: 0, cigarettesAvoided: 0, co2SavedKg: 0 };
}

/**
 * What changing from `base` to `next` saves for the given members, rounded for display.
 * Every figure keeps the sign of the change, so a change that makes things worse reads as
 * negative rather than zero. The do-no-harm rule in `guard` is what keeps such changes out of
 * a plan; nothing is clamped here.
 */
export function impactBetween(
  base: HouseholdExposure,
  next: HouseholdExposure,
  memberIds: readonly string[],
  co2SavedKg = 0,
): Impact {
  let saved = 0;
  let baseTotal = 0;
  let concSaved = 0;
  for (const id of memberIds) {
    const b = base.get(id);
    const n = next.get(id);
    if (!b || !n) continue;
    saved += b.doseUg - n.doseUg;
    baseTotal += b.doseUg;
    concSaved += b.concHours - n.concHours;
  }
  return {
    doseSavedUg: round(saved),
    exposureCutPct: baseTotal > 0 ? round((saved / baseTotal) * 100, 1) : 0,
    cigarettesAvoided: round(
      cigarettesFromConcHours(Math.abs(concSaved)) * Math.sign(concSaved),
      2,
    ),
    co2SavedKg: round(co2SavedKg, 2),
  };
}
