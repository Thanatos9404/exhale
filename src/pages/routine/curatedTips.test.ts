import { describe, expect, it } from 'vitest';
import { aiPlanSchema } from '@/lib/apiTypes';
import { CURATED_HACKS, CURATED_SWAPS } from './curatedTips';

const LISTS = [
  ['indoor hacks', CURATED_HACKS, aiPlanSchema.shape.indoorHacks],
  ['sustainable swaps', CURATED_SWAPS, aiPlanSchema.shape.sustainableSwaps],
] as const;

describe('curated tips', () => {
  it.each(LISTS)('%s fit the same shape and limits as the AI tips they stand in for', (...row) => {
    const [, tips, schema] = row;
    const parsed = schema.safeParse(tips);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual(tips);
  });

  it.each(LISTS)('%s are complete sentences with a short title', (_, tips) => {
    for (const tip of tips) {
      expect(tip.title.trim()).toBe(tip.title);
      expect(tip.title).toMatch(/^[A-Z]/);
      expect(tip.title).not.toMatch(/\.$/);
      expect(tip.detail).toMatch(/^[A-Z].*\.$/s);
      expect(tip.impact.trim().length).toBeGreaterThan(0);
    }
  });

  it('never repeats a tip, within a list or across the two', () => {
    const all = [...CURATED_HACKS, ...CURATED_SWAPS];
    expect(new Set(all.map((t) => t.title)).size).toBe(all.length);
    expect(new Set(all.map((t) => t.detail)).size).toBe(all.length);
  });

  it('uses no em or en dashes in user-facing copy', () => {
    expect(JSON.stringify([CURATED_HACKS, CURATED_SWAPS])).not.toMatch(/[–—]/);
  });

  it('keeps the indoor list about the home and the swaps about emissions', () => {
    expect(CURATED_HACKS.map((t) => `${t.detail} ${t.impact}`).join(' ')).toMatch(/indoor/i);
    expect(CURATED_SWAPS.map((t) => `${t.detail} ${t.impact}`).join(' ')).toMatch(
      /burning|exhaust|drive/i,
    );
  });
});
