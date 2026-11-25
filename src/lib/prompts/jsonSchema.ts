/**
 * The JSON Schemas a model answers in. The server's Gemini call uses the full plan schema; the
 * browser's hybrid model (Gemini Nano on the device, cloud Gemini through Firebase as fallback)
 * uses the explanations part of the same schema. Both mirror `aiPlanSchema` in ../apiTypes.ts,
 * which validates every answer before it is used.
 */

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

/** A plain JSON Schema node, in the mutable shape SDKs accept for structured output. */
export interface JsonSchema {
  type: 'object' | 'array' | 'string';
  description?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  /** JSON Schema allows further keywords; SDK schema types say so with an index signature. */
  [keyword: string]: unknown;
}

const ITEMS = AI_PLAN_JSON_SCHEMA.properties.items;

/**
 * The explanations alone: one "why" per routine item id, built from the plan schema's own
 * `items` entry. Smaller than the full plan schema, so it fits comfortably in Gemini Nano's
 * context and output budget.
 */
export const PLAN_EXPLANATIONS_JSON_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      description: ITEMS.description,
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, why: { ...ITEMS.items.properties.why } },
        required: [...ITEMS.items.required],
      },
    },
  },
  required: ['items'],
};
