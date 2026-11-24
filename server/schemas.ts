/**
 * Request and AI-response contracts for the API: what a body must look like before a handler
 * touches it, and the JSON Schema the plan model must answer in.
 */
import { z } from 'zod';
import { householdSchema } from '../src/lib/profile/schema.js';
export { aiPlanSchema, type AiPlan } from '../src/lib/apiTypes.js';

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

/** JSON Schema handed to Gemini's structured-output mode; mirrors `aiPlanSchema`. */
export const AI_PLAN_JSON_SCHEMA = {
  type: 'object',
  properties: {
    headline: {
      type: 'string',
      description:
        'One sentence, under 160 characters, naming the single most important move today.',
    },
    summary: {
      type: 'string',
      description:
        'Two or three sentences for the family explaining why today is bad or good and what the plan achieves, quoting the numbers given.',
    },
    items: {
      type: 'array',
      description: 'One entry per routine item id from the context, in the same order.',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          why: {
            type: 'string',
            description:
              'Personal, concrete reason for this action, under 280 characters, using the given numbers.',
          },
        },
        required: ['id', 'why'],
      },
    },
    indoorHacks: {
      type: 'array',
      description:
        'Three indoor air quality hacks suited to this home that are not already in the routine.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          impact: {
            type: 'string',
            description:
              'The direct effect in plain words, e.g. "Cuts bedroom PM2.5 by about a third overnight".',
          },
        },
        required: ['title', 'detail', 'impact'],
      },
    },
    sustainableSwaps: {
      type: 'array',
      description:
        'Three low-emission alternatives for this household and city that reduce what they add to the smog.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          impact: { type: 'string' },
        },
        required: ['title', 'detail', 'impact'],
      },
    },
    familyNote: {
      type: 'string',
      description:
        'Optional note for children, older adults or anyone with a condition in the household.',
    },
  },
  required: ['headline', 'summary', 'items', 'indoorHacks', 'sustainableSwaps'],
} as const;
