/**
 * Runtime shape of a `PlanResult`, for plans that arrive over the network. The browser parses
 * the server's answer with it instead of trusting the JSON, so a truncated or outdated response
 * fails at the boundary rather than deep inside a chart.
 *
 * The annotation ties the schema to the `PlanResult` interface: a field that drifts from the
 * type stops compiling here.
 */
import { z } from 'zod';
import type { PlanResult } from './types.js';

/** "HH:00" labels for a run of hours. */
const span = z.object({ start: z.string(), end: z.string() });

const impact = z.object({
  doseSavedUg: z.number(),
  exposureCutPct: z.number(),
  cigarettesAvoided: z.number(),
  co2SavedKg: z.number(),
});

const routineItem = z.object({
  id: z.string(),
  kind: z.enum(['ventilate', 'exercise', 'commute', 'protect', 'home', 'upgrade']),
  status: z.enum(['go', 'caution', 'avoid']),
  time: z.string().nullable(),
  endTime: z.string().nullable(),
  title: z.string(),
  detail: z.string(),
  memberIds: z.array(z.string()),
  impact,
  freeAction: z.boolean(),
  change: z.object({ before: z.string(), after: z.string() }).optional(),
});

const memberSummary = z.object({
  id: z.string(),
  name: z.string(),
  sensitivity: z.number(),
  pm25Limit: z.number(),
  budgetUg: z.number(),
  baselineDoseUg: z.number(),
  optimizedDoseUg: z.number(),
  baselineCigarettes: z.number(),
  optimizedCigarettes: z.number(),
});

const risk = z.object({
  aqi: z.number(),
  level: z.literal([0, 1, 2, 3, 4, 5]),
  label: z.string(),
  advice: z.string(),
  dominant: z.enum(['pm25', 'pm10', 'no2', 'o3']),
  standard: z.enum(['us', 'in']),
});

const current = z.object({
  pm25: z.number().nullable(),
  blh: z.number().nullable(),
  wind: z.number().nullable(),
  ventilationCoefficient: z.number().nullable(),
  dispersion: z.enum(['stagnant', 'poor', 'moderate', 'good']).nullable(),
});

/** A clean or dirty window: its hours and mean PM2.5. */
const pmWindow = span.extend({ pm25: z.number() }).nullable();

const totals = z.object({
  baselineDoseUg: z.number(),
  optimizedDoseUg: z.number(),
  exposureCutPct: z.number(),
  cigarettesAvoided: z.number(),
  co2SavedKgDay: z.number(),
  co2SavedKgWeek: z.number(),
});

/** Validates a plan produced by `buildPlan` after a trip through JSON. */
export const planResultSchema: z.ZodType<PlanResult> = z.object({
  placeLabel: z.string(),
  generatedAt: z.string(),
  horizon: span,
  risk,
  current,
  lid: z.object({
    spans: z.array(span.extend({ minBlh: z.number() })),
    stagnantHours: z.number(),
  }),
  cleanWindow: pmWindow,
  worstWindow: pmWindow,
  headline: z.string(),
  items: z.array(routineItem),
  members: z.array(memberSummary),
  totals,
});
