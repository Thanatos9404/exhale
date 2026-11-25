/**
 * Request and AI-response contracts for the API: what a body must look like before a handler
 * touches it, and the JSON Schema the plan model must answer in (shared with the browser from
 * src/lib/prompts/jsonSchema.ts).
 */
import { z } from 'zod';
import { householdSchema } from '../src/lib/profile/schema.js';
export { aiPlanSchema, type AiPlan } from '../src/lib/apiTypes.js';
export { AI_PLAN_JSON_SCHEMA } from '../src/lib/prompts/jsonSchema.js';

/** Sixteen turns of history is plenty for context and bounds cost; the client sends as many. */
export const MAX_CHAT_MESSAGES = 16;

/** Longest question, matching the composer's limit in the browser. */
export const MAX_USER_TURN_CHARS = 2_000;

/**
 * Longest replayed answer accepted. The browser stores answers of up to 8,000 characters and
 * sends them back as history, so a lower cap would turn every request after one long answer into
 * a 400. The prompt builder shortens them again before any model sees them.
 */
export const MAX_MODEL_TURN_CHARS = 8_000;

/**
 * Coordinates and a display label. The label allows only letters (with their combining marks),
 * digits and address punctuation.
 */
export const placeSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  label: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[\p{L}\p{M}\p{N} .,'()&/-]*$/u),
});

/** Body of POST /api/plan. */
export const planRequestSchema = z.object({
  place: placeSchema,
  household: householdSchema,
});

/**
 * One chat turn. The limit depends on who wrote it: a question is typed by the user, a model turn
 * is an earlier answer the browser replays.
 */
export const chatMessageSchema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('user'), text: z.string().trim().min(1).max(MAX_USER_TURN_CHARS) }),
  z.object({ role: z.literal('model'), text: z.string().trim().min(1).max(MAX_MODEL_TURN_CHARS) }),
]);

/** Body of POST /api/chat. */
export const chatRequestSchema = z.object({
  place: placeSchema,
  household: householdSchema,
  messages: z.array(chatMessageSchema).min(1).max(MAX_CHAT_MESSAGES),
  search: z.boolean().default(false),
});

export type PlanRequest = z.infer<typeof planRequestSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
