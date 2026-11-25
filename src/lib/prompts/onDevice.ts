/**
 * Prompts and answer checks for the private, on-device path: Gemini Nano in Chrome through
 * Firebase AI Logic, with cloud Gemini as its fallback. They are built from the same guardrails
 * and CONTEXT as the server's prompts, so the household's details arrive in the same tagged,
 * neutralised data blocks wherever the model runs. On-device inference is single-turn, so each
 * request carries its whole CONTEXT.
 */
import { z } from 'zod';
import { aiPlanSchema } from '../apiTypes.js';
import type { PlanResult } from '../planner/engine.js';
import type { Household } from '../profile/schema.js';
import { buildChatContext } from './context.js';
import { CHAT_PERSONA, GUARDRAILS, PLAN_PERSONA, STYLE, asData } from './guardrails.js';

/** Longest question sent to the on-device model, matching the composer's limit. */
export const MAX_ON_DEVICE_QUESTION_CHARS = 2_000;

/** System prompt for the private explanations: one "why" per action, as JSON. */
export const EXPLAIN_SYSTEM = `${PLAN_PERSONA}
${GUARDRAILS}
${STYLE}
Return JSON only, matching the response schema.`;

/** System prompt for a private answer: short, plain text, grounded in CONTEXT numbers. */
export const ASK_SYSTEM = `${CHAT_PERSONA}
${GUARDRAILS}
${STYLE}
Format: Markdown with short paragraphs or tight bullet lists. Keep answers under 120 words.`;

/** The private explanations request: CONTEXT plus a task that asks for the explanations only. */
export function buildExplainPrompt(plan: PlanResult, household: Household): string {
  return `${buildChatContext(plan, household)}

TASK
Write a personal "why" for every routine item id above (same ids, same order), under 280 characters each, using the numbers given. Return {"items":[{"id":"...","why":"..."}]}.`;
}

/** One private question: CONTEXT, then the question in its <user> data block. */
export function buildAskPrompt(question: string, plan: PlanResult, household: Household): string {
  const asked = question.trim().slice(0, MAX_ON_DEVICE_QUESTION_CHARS);
  return `${buildChatContext(plan, household)}

QUESTION
${asData('user', asked)}`;
}

/** The explanations answer: the `items` part of the plan wording the server validates. */
export const explanationsSchema = z.object({ items: aiPlanSchema.shape.items });

/** Why a model answer was refused. */
export class InvalidExplanationsError extends Error {
  constructor(reason: string) {
    super(`The model's explanations were rejected: ${reason}`);
    this.name = 'InvalidExplanationsError';
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new InvalidExplanationsError('not valid JSON');
  }
}

/**
 * The model's explanations keyed by action id, validated with the server's schema. Ids the plan
 * does not contain are dropped, so a model can explain an action but never invent one; an answer
 * that explains none of the plan's actions is refused.
 */
export function parseExplanations(text: string, plan: PlanResult): Map<string, string> {
  const parsed = explanationsSchema.safeParse(parseJson(text));
  if (!parsed.success) throw new InvalidExplanationsError('it does not match the schema');
  const known = new Set(plan.items.map((item) => item.id));
  const why = new Map(
    parsed.data.items.filter((item) => known.has(item.id)).map((item) => [item.id, item.why]),
  );
  if (why.size === 0) throw new InvalidExplanationsError('it explains none of the actions');
  return why;
}
