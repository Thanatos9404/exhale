import { z } from 'zod';
import type { PlanResult } from './planner/engine.js';

/** Contracts shared by the browser and the server functions. */

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

export type AiPlan = z.infer<typeof aiPlanSchema>;
export type AiTip = z.infer<typeof tip>;

export interface PlanResponse {
  plan: PlanResult;
  ai: AiPlan | null;
  source: 'gemini' | 'rules';
  model: string | null;
}

export interface HealthResponse {
  ok: boolean;
  ai: boolean;
  model: string | null;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}
