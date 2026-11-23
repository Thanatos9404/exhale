// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fallbackAnswer } from './fallback';
import { buildPlan, type PlanResult, type RoutineItem } from '../src/lib/planner/engine';
import { DEFAULT_HOUSEHOLD } from '../src/lib/profile/schema';
import { makeSnapshot } from '../src/test/fixtures';

const base = buildPlan(DEFAULT_HOUSEHOLD, makeSnapshot(), new Date('2026-11-23T00:00:00Z'));

function item(
  title: string,
  kind: RoutineItem['kind'],
  overrides: Partial<RoutineItem> = {},
): RoutineItem {
  return {
    id: title.toLowerCase().replace(/\W+/g, '-'),
    kind,
    status: 'go',
    time: null,
    endTime: null,
    title,
    detail: `Because of ${kind}.`,
    memberIds: ['you'],
    impact: { doseSavedUg: 0, exposureCutPct: 0, cigarettesAvoided: 0, co2SavedKg: 0 },
    freeAction: true,
    ...overrides,
  };
}

/** One item of every kind, in the engine's free-first order. */
const ITEMS = [
  item('Kid cycles at 14:00', 'exercise'),
  item('Air out at 14:00', 'ventilate'),
  item('Metro instead of car', 'commute'),
  item('Close windows overnight', 'protect'),
  item('Skip the mosquito coil', 'home'),
  item('Wear an N95 on the school run', 'protect'),
  item('Buy a HEPA purifier', 'upgrade', { freeAction: false }),
];

const plan = (overrides: Partial<PlanResult> = {}): PlanResult => ({
  ...base,
  headline: 'A smog lid sits until 11:00; air out at 14:00.',
  cleanWindow: { start: '14:00', end: '15:00', pm25: 70 },
  lid: { spans: [], stagnantHours: 9 },
  items: ITEMS,
  ...overrides,
});

/** Titles of the routine items an answer lists, in order. */
const listed = (answer: string) =>
  [...answer.matchAll(/^- \*\*(?:\d{2}:\d{2} )?(.+?)\.\*\*/gm)].map((m) => m[1]);

const intro = (answer: string) => answer.split('\n\n')[0];

describe('fallbackAnswer topics', () => {
  it('answers exercise questions with exercise and airing items and the clean hour', () => {
    const answer = fallbackAnswer('When can my kid play outside?', plan());
    expect(intro(answer)).toBe(
      'The cleanest daylight hour today is **14:00** at about 70 µg/m³ of PM2.5.',
    );
    expect(listed(answer)).toEqual(['Kid cycles at 14:00', 'Air out at 14:00']);
  });

  it('says so when no daylight hour is clean', () => {
    const answer = fallbackAnswer('Is it ok to jog?', plan({ cleanWindow: null }));
    expect(intro(answer)).toBe('There is no clearly clean hour in today’s forecast.');
  });

  it('answers commute questions with the commute items only', () => {
    const answer = fallbackAnswer('Should I drive or take the metro?', plan());
    expect(intro(answer)).toBe('Here is what the numbers say about your commute.');
    expect(listed(answer)).toEqual(['Metro instead of car']);
  });

  it('matches whole words, so "care" is not read as "car"', () => {
    const p = plan();
    const answer = fallbackAnswer('How do I take care of my asthma?', p);
    // No topic matches, so the answer falls back to the headline and the free actions.
    expect(intro(answer)).toBe(p.headline);
  });

  it('still catches inflected topic words', () => {
    expect(intro(fallbackAnswer('Is cycling ok today?', plan()))).toContain(
      'cleanest daylight hour',
    );
    expect(intro(fallbackAnswer('We take buses to school', plan()))).toBe(
      'Here is what the numbers say about your commute.',
    );
    expect(intro(fallbackAnswer('Does ventilating help?', plan()))).toContain('smog lid');
  });

  it('answers window questions with airing and protection items and the smog lid', () => {
    const answer = fallbackAnswer('Is it safe to open the windows?', plan());
    expect(intro(answer)).toBe('A smog lid covers 9 of the next 24 hours, so timing matters.');
    expect(listed(answer)).toEqual([
      'Air out at 14:00',
      'Close windows overnight',
      'Wear an N95 on the school run',
    ]);
  });

  it('says dispersion is reasonable when no hours are stagnant', () => {
    const answer = fallbackAnswer(
      'When should we ventilate?',
      plan({ lid: { spans: [], stagnantHours: 0 } }),
    );
    expect(intro(answer)).toBe('Dispersion is reasonable today.');
  });

  it('answers indoor questions with home changes and upgrades', () => {
    const answer = fallbackAnswer('Is a purifier worth it for kitchen smoke?', plan());
    expect(intro(answer)).toBe(
      'Indoor air is where your family spends most hours, so these matter most.',
    );
    expect(listed(answer)).toEqual(['Skip the mosquito coil', 'Buy a HEPA purifier']);
  });

  it('answers mask questions with fit advice, N95 items and the commute', () => {
    const answer = fallbackAnswer('Does a KN95 mask help?', plan());
    expect(intro(answer)).toMatch(/^A well-fitted N95 or FFP2 removes most fine particles/);
    expect(intro(answer)).toContain('cloth and surgical masks do little against PM2.5');
    expect(listed(answer)).toEqual(['Metro instead of car', 'Wear an N95 on the school run']);
  });

  it('uses the first matching topic when a question touches several', () => {
    // "cycle" (exercise) is checked before "office" (commute).
    const answer = fallbackAnswer('Can I cycle to the office?', plan());
    expect(intro(answer)).toContain('The cleanest daylight hour today');
    expect(listed(answer)).not.toContain('Metro instead of car');
  });

  it('matches topics regardless of case', () => {
    expect(listed(fallbackAnswer('PARK OR GYM?', plan()))).toEqual([
      'Kid cycles at 14:00',
      'Air out at 14:00',
    ]);
  });

  it('falls back to the headline and up to four free actions for other questions', () => {
    const answer = fallbackAnswer('hello', plan());
    expect(intro(answer)).toBe('A smog lid sits until 11:00; air out at 14:00.');
    expect(listed(answer)).toEqual([
      'Kid cycles at 14:00',
      'Air out at 14:00',
      'Metro instead of car',
      'Close windows overnight',
    ]);
  });

  it('never lists upgrades as free actions', () => {
    const upgrades = [1, 2, 3].map((n) => item(`Upgrade ${n}`, 'upgrade', { freeAction: false }));
    const answer = fallbackAnswer('thanks', plan({ items: [...upgrades, ITEMS[0]!] }));
    expect(listed(answer)).toEqual(['Kid cycles at 14:00']);
  });

  it('caps a topic at four items', () => {
    const many = [1, 2, 3, 4, 5, 6].map((n) => item(`Airing ${n}`, 'ventilate'));
    expect(listed(fallbackAnswer('open a window?', plan({ items: many })))).toEqual([
      'Airing 1',
      'Airing 2',
      'Airing 3',
      'Airing 4',
    ]);
  });

  it('says there is nothing to change when no item fits the topic', () => {
    const answer = fallbackAnswer('Should I take the bus?', plan({ items: [ITEMS[0]!] }));
    expect(answer.split('\n\n')[1]).toBe('- Nothing specific to change for this today.');
  });
});

describe('fallbackAnswer formatting', () => {
  const metro = item('Metro instead of car', 'commute', {
    time: '09:00',
    detail: 'Leave at 09:00 by metro.',
    impact: { doseSavedUg: 123456, exposureCutPct: 30, cigarettesAvoided: 2.4, co2SavedKg: 3.1 },
  });

  it('writes the time, title, detail and Indian-grouped savings for each item', () => {
    expect(fallbackAnswer('Should I take the bus?', plan({ items: [metro] }))).toBe(
      [
        'Here is what the numbers say about your commute.',
        '- **09:00 Metro instead of car.** Leave at 09:00 by metro. Saves about 1,23,456 µg (2.4 cigarette-equivalents).',
        "_Answered by Exhale's offline engine. Add a Gemini API key on the server for full conversational answers._",
      ].join('\n\n'),
    );
  });

  it('omits the time and the savings sentence when there are none', () => {
    const answer = fallbackAnswer(
      'Should I take the bus?',
      plan({ items: [{ ...metro, time: null, impact: { ...metro.impact, doseSavedUg: 0 } }] }),
    );
    expect(answer.split('\n\n')[1]).toBe('- **Metro instead of car.** Leave at 09:00 by metro.');
  });

  it('explains that AI is busy when a key is configured', () => {
    const answer = fallbackAnswer('hello', plan(), true);
    expect(
      answer.endsWith(
        "_Gemini is busy right now, so Exhale's offline engine answered from your live plan. Ask again in a minute for a conversational answer._",
      ),
    ).toBe(true);
    expect(answer).not.toContain('Add a Gemini API key');
  });
});
