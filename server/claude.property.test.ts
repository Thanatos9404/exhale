// @vitest-environment node
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { strictSchema } from './claude';

/** Property tests for the JSON Schema rewrite that Claude's structured outputs need. */

const RUNS = { numRuns: 150 };

/** Arbitrary schema-shaped JSON: nested objects and arrays, some marked `type: 'object'`. */
const schemaArb = fc.letrec<{ node: unknown; object: Record<string, unknown> }>((tie) => ({
  node: fc.oneof(
    { depthSize: 'small' },
    fc.constantFrom('string', 'object', 'array', null, true, 3),
    fc.array(tie('node'), { maxLength: 3 }),
    tie('object'),
  ),
  object: fc.dictionary(
    fc.constantFrom('type', 'properties', 'items', 'required', 'description', 'a', 'b'),
    tie('node'),
    { maxKeys: 4 },
  ),
})).object;

const isObject = (node: unknown): node is Record<string, unknown> =>
  typeof node === 'object' && node !== null && !Array.isArray(node);

/** Every plain object anywhere inside a value, the value itself included. */
function objectsIn(node: unknown): Record<string, unknown>[] {
  if (Array.isArray(node)) return node.flatMap(objectsIn);
  if (!isObject(node)) return [];
  return [node, ...Object.values(node).flatMap(objectsIn)];
}

/** The value with every `additionalProperties: false` that sits on an object schema removed. */
function reopened(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(reopened);
  if (!isObject(node)) return node;
  const entries = Object.entries(node)
    .filter(([key, value]) => !(key === 'additionalProperties' && value === false))
    .map(([key, value]) => [key, reopened(value)]);
  return Object.fromEntries(entries);
}

describe('strictSchema properties', () => {
  it('closes every object schema, however deeply it is nested', () => {
    fc.assert(
      fc.property(schemaArb, (schema) => {
        for (const node of objectsIn(strictSchema(schema))) {
          if (node.type === 'object') expect(node.additionalProperties).toBe(false);
        }
      }),
      RUNS,
    );
  });

  it('changes nothing else, and never edits the schema it was given', () => {
    fc.assert(
      fc.property(schemaArb, (schema) => {
        const before = structuredClone(schema);
        const closed = strictSchema(schema);
        expect(schema).toEqual(before);
        expect(reopened(closed)).toEqual(reopened(schema));
      }),
      RUNS,
    );
  });

  it('is idempotent', () => {
    fc.assert(
      fc.property(schemaArb, (schema) => {
        const once = strictSchema(schema);
        expect(strictSchema(once)).toEqual(once);
      }),
      RUNS,
    );
  });
});
