/**
 * Data model for deployments: the shapes of a build-log line and a finished deployment, and the
 * validators for what this browser stored earlier. No React; ./Deployments and ./runDeployment
 * build on it.
 */
import { z } from 'zod';
import type { PlanResponse } from '@/lib/apiTypes';

/** Severity and source of one build-log line. */
export type LogKind = 'info' | 'ok' | 'warn' | 'error' | 'ai';

/** One line of the deploy build log. */
export interface LogLine {
  at: number;
  kind: LogKind;
  text: string;
}

/** A finished deployment: the plan response plus the facts shown in the history list. */
export interface Deployment {
  id: string;
  at: string;
  placeLabel: string;
  cutPct: number;
  source: PlanResponse['source'];
  model: string | null;
  response: PlanResponse;
}

/** Stored responses are only checked for a plan with items; the rest was written by this app. */
const storedResponseShape = z.looseObject({
  plan: z.looseObject({ items: z.array(z.unknown()) }),
});
const storedResponseSchema = z.custom<PlanResponse>(
  (raw) => storedResponseShape.safeParse(raw).success,
);

const deploymentSchema = z.object({
  id: z.string(),
  at: z.string(),
  placeLabel: z.string(),
  cutPct: z.number(),
  source: z.enum(['gemini', 'claude', 'rules']),
  model: z.string().nullable(),
  response: storedResponseSchema,
});

/** Validates the stored deployment history; null when it is missing or malformed. */
export const parseHistory = (raw: unknown): Deployment[] | null => {
  const r = z.array(deploymentSchema).max(8).safeParse(raw);
  return r.success ? r.data : null;
};

/** Today's date as the key that scopes the "done" ticks to one day. */
export const todayKey = () => new Date().toISOString().slice(0, 10);

/** Validates the stored "done" ticks and drops them when they belong to another day. */
export const parseDone = (raw: unknown) => {
  const r = z.object({ day: z.string(), ids: z.array(z.string().max(40)).max(40) }).safeParse(raw);
  return r.success && r.data.day === todayKey() ? new Set(r.data.ids) : null;
};
