/**
 * Narrows a value that the surrounding logic guarantees is present.
 *
 * Use it only for true invariants (an index the caller has already bounds-checked,
 * a lookup into a table that is complete by construction). It fails loudly with a
 * named error instead of letting `undefined` leak into later arithmetic or rendering.
 */
export function defined<T>(value: T | null | undefined, what = 'value'): T {
  if (value === null || value === undefined) throw new Error(`Expected ${what} to be defined`);
  return value;
}
