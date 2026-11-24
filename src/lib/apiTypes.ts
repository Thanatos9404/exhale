/**
 * Contracts shared by the browser and the server functions. Both sides import the same shapes
 * and schemas from here, so a response cannot change on one side without the other noticing.
 */
import { z } from 'zod';
import type { PlanResult } from './planner/engine.js';
import { planResultSchema } from './planner/planSchema.js';

/** A short practical tip written by the model. */
const tip = z.object({
  title: z.string().min(1).max(90),
  detail: z.string().min(1).max(300),
  impact: z.string().min(1).max(140),
});

/** What Gemini must return for a plan. Numbers stay with the engine; the model writes the words. */
export const aiPlanSchema = z.object({
  headline: z.string().min(1).max(180),
  summary: z.string().min(1).max(600),
  items: z.array(z.object({ id: z.string().max(40), why: z.string().min(1).max(320) })).max(20),
  indoorHacks: z.array(tip).min(1).max(4),
  sustainableSwaps: z.array(tip).min(1).max(4),
  familyNote: z.string().max(360).optional(),
});

/** The model's wording for a plan; ids in `items` refer to the engine's routine items. */
export type AiPlan = z.infer<typeof aiPlanSchema>;
/** One indoor hack or sustainable swap. */
export type AiTip = z.infer<typeof tip>;

/** POST /api/plan: the engine's plan plus the model's wording, or null when only rules ran. */
export interface PlanResponse {
  plan: PlanResult;
  ai: AiPlan | null;
  source: 'gemini' | 'claude' | 'rules';
  model: string | null;
}

/** Validates the body of a successful POST /api/plan before the browser uses it. */
export const planResponseSchema: z.ZodType<PlanResponse> = z.object({
  plan: planResultSchema,
  ai: aiPlanSchema.nullable(),
  source: z.enum(['gemini', 'claude', 'rules']),
  model: z.string().nullable(),
});

/** GET /api/health: whether the server is up and which AI providers are configured. */
export interface HealthResponse {
  ok: boolean;
  ai: boolean;
  model: string | null;
  /** Configured providers in fallback order, e.g. ["gemini", "claude"]. */
  providers?: string[];
}

/** Validates the body of a successful GET /api/health. */
export const healthResponseSchema: z.ZodType<HealthResponse> = z.object({
  ok: z.boolean(),
  ai: z.boolean(),
  model: z.string().nullable(),
  providers: z.array(z.string()).optional(),
});

/** The JSON body of a failed request: `{ error: "message safe to show" }`. */
export const errorBodySchema = z.object({ error: z.string().min(1) });

/** One chat turn. 'model' is the assistant, following the Gemini role names. */
export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}
