import { z } from 'zod';
import type { PlanResult } from './planner/engine.js';

/** Contracts shared by the browser and the server functions. */

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

/** GET /api/health: whether the server is up and which AI providers are configured. */
export interface HealthResponse {
  ok: boolean;
  ai: boolean;
  model: string | null;
  /** Configured providers in fallback order, e.g. ["gemini", "claude"]. */
  providers?: string[];
}

/** One chat turn. 'model' is the assistant, following the Gemini role names. */
export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}
