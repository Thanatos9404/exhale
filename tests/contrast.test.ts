// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Colour contrast, proved by calculation. The custom properties of both themes are parsed
 * straight from src/styles/index.css, converted to sRGB, and every pairing in the table below
 * is checked against its WCAG 2.2 minimum: 4.5:1 for text (SC 1.4.3) and 3:1 for the boundaries,
 * focus rings and fills that carry meaning (SC 1.4.11). The table is the documentation: a new
 * way of putting one token on another belongs in it.
 */

const TEXT = 4.5;
const NON_TEXT = 3;

/** Named groups a table cell can use in place of a list of tokens. */
const GROUPS: Record<string, string> = {
  neutrals: 'background surface surface-2 hover active',
  tints: 'blue-soft green-soft amber-soft red-soft diff-add diff-del',
  'aqi-fills': 'aqi-0 aqi-1 aqi-2 aqi-3 aqi-4 aqi-5',
  'aqi-text': 'aqi-0-text aqi-1-text aqi-2-text aqi-3-text aqi-4-text aqi-5-text',
  white: '#ffffff',
};

/**
 * Every foreground in a row must reach the row's minimum on every background in that row.
 * Cells hold token names without the leading `--`, a group from GROUPS, or a literal hex colour.
 */
const PAIRS = `
  what it is                              | foreground                 | sits on            | min
  ----------------------------------------|----------------------------|--------------------|-----
  body, secondary and hint text           | fg muted subtle            | neutrals           | 4.5
  links, deltas, errors and status text   | blue green amber red       | neutrals           | 4.5
  blue badge                              | blue                       | blue-soft          | 4.5
  green badge                             | green                      | green-soft         | 4.5
  amber badge                             | amber                      | amber-soft         | 4.5
  red badge and danger zone               | red                        | red-soft           | 4.5
  diff rows on the Impact page            | fg                         | diff-add diff-del  | 4.5
  the plus and minus of a diff row        | green                      | diff-add           | 4.5
  the plus and minus of a diff row        | red                        | diff-del           | 4.5
  Button primary: label on its solid fill | background                 | fg                 | 4.5
  Button error: label on its solid fill   | white                      | red-solid          | 4.5
  Button secondary: label, rest and hover | fg                         | surface hover      | 4.5
  Button tertiary: label, rest and hover  | fg                         | neutrals           | 4.5
  AQI numbers and labels                  | aqi-text                   | neutrals           | 4.5
  input, select, checkbox, slider border  | field-border               | neutrals           | 3
  segmented group and its selected ring   | field-border               | neutrals           | 3
  switch tracks, off and on               | field-border blue-solid    | neutrals           | 3
  switch thumb on either track            | white                      | field-border blue-solid | 3
  focus ring                              | focus                      | neutrals tints     | 3
  selected tab bar                        | fg                         | neutrals           | 3
  AQI dots, strips and chart areas        | aqi-fills                  | neutrals           | 3
  status dots                             | blue green amber red       | neutrals           | 3
`;

interface PairRow {
  what: string;
  foregrounds: string[];
  backgrounds: string[];
  min: number;
}

const expand = (cell: string) =>
  cell
    .trim()
    .split(/\s+/)
    .flatMap((name) => (GROUPS[name] ?? name).split(' '));

const ROWS: PairRow[] = PAIRS.trim()
  .split('\n')
  .slice(2)
  .map((line) => {
    const [what = '', foregrounds = '', backgrounds = '', min = ''] = line.split('|');
    return {
      what: what.trim(),
      foregrounds: expand(foregrounds),
      backgrounds: expand(backgrounds),
      min: Number(min),
    };
  });

/* Parsing the stylesheet ------------------------------------------------------------------- */

type Theme = 'light' | 'dark';
type Tokens = Map<string, string>;
/** Gamma-encoded sRGB, each channel from 0 to 1. */
type Rgb = [number, number, number];

const stylesheet = readFileSync('src/styles/index.css', 'utf8');

/** The custom properties declared in the rule for `[data-theme='<theme>']`. */
function themeTokens(theme: Theme): Tokens {
  const rule = new RegExp(`\\[data-theme='${theme}'\\]\\s*\\{([^}]*)\\}`).exec(stylesheet);
  if (!rule?.[1]) throw new Error(`No rule for the ${theme} theme in src/styles/index.css`);
  const declarations = rule[1].matchAll(/--([\w-]+):\s*([^;]+);/g);
  return new Map([...declarations].map((d) => [d[1] ?? '', (d[2] ?? '').trim()]));
}

const THEMES: Record<Theme, Tokens> = { light: themeTokens('light'), dark: themeTokens('dark') };

/** A token's value with `var(--other)` references followed to the end. */
function resolve(tokens: Tokens, name: string): string {
  const value = tokens.get(name);
  if (value === undefined) throw new Error(`Token --${name} is not defined`);
  const reference = /^var\(--([\w-]+)\)$/.exec(value);
  return reference?.[1] ? resolve(tokens, reference[1]) : value;
}

/* Colour conversion ------------------------------------------------------------------------ */

/** sRGB transfer function, linear light to encoded (IEC 61966-2-1). */
const encode = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
/** sRGB transfer function, encoded to linear light, as WCAG 2.2 "relative luminance" gives it. */
const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const clamp = (c: number) => Math.min(1, Math.max(0, c));

function parseHex(value: string): Rgb {
  const digits = value.slice(1);
  const full = digits.length <= 4 ? digits.replace(/./g, '$&$&') : digits;
  const channel = (i: number) => parseInt(full.slice(i, i + 2), 16) / 255;
  return [channel(0), channel(2), channel(4)];
}

/**
 * OKLCH to sRGB, by the route CSS Color Module Level 4 section 10 ("OKLab and OKLCH") gives:
 *   a = C cos(h), b = C sin(h)                                  (polar to OKLab)
 *   l', m', s' = M2^-1 [L, a, b];  l, m, s = l'^3, m'^3, s'^3   (OKLab to LMS)
 *   [R, G, B] linear = M1^-1 [l, m, s]                          (LMS to linear sRGB)
 * with the matrices from Björn Ottosson, "A perceptual color space for image processing" (2020),
 * followed by the sRGB transfer function. Out-of-gamut results are clipped per channel.
 */
function oklchToRgb(lightness: number, chroma: number, hueDegrees: number): Rgb {
  const hue = (hueDegrees * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const red = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const green = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const blue = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return [encode(clamp(red)), encode(clamp(green)), encode(clamp(blue))];
}

const number = (part: string, percentOf: number) =>
  part.endsWith('%') ? (parseFloat(part) / 100) * percentOf : parseFloat(part);

/** Parses the colour formats a token may be written in: hex, `rgb()` and `oklch()`. */
function parseColor(value: string): Rgb {
  if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) return parseHex(value);
  const call = /^(rgba?|oklch)\(([^)]+)\)$/i.exec(value);
  const [first = '', second = '', third = ''] = (call?.[2] ?? '').split(/[\s,/]+/);
  if (call?.[1]?.toLowerCase().startsWith('rgb'))
    return [number(first, 255) / 255, number(second, 255) / 255, number(third, 255) / 255];
  if (call) return oklchToRgb(number(first, 1), number(second, 0.4), parseFloat(third));
  throw new Error(`Cannot parse the colour "${value}"`);
}

/* WCAG maths ------------------------------------------------------------------------------- */

/** WCAG 2.2 relative luminance: L = 0.2126 R + 0.7152 G + 0.0722 B over linear-light channels. */
function luminance([r, g, b]: Rgb): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG 2.2 contrast ratio: (L1 + 0.05) / (L2 + 0.05), with L1 the lighter of the two. */
function contrast(one: string, other: string): number {
  const a = luminance(parseColor(one));
  const b = luminance(parseColor(other));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const colorOf = (tokens: Tokens, name: string) =>
  name.startsWith('#') ? name : resolve(tokens, name);

/** Every pairing of a row that falls short of its minimum, with the ratio it reaches. */
function shortfalls(tokens: Tokens, row: PairRow): string[] {
  return row.foregrounds.flatMap((fg) =>
    row.backgrounds
      .map((bg) => ({ bg, ratio: contrast(colorOf(tokens, fg), colorOf(tokens, bg)) }))
      .filter(({ ratio }) => ratio < row.min)
      .map(({ bg, ratio }) => `${fg} on ${bg} is ${ratio.toFixed(2)}:1, needs ${row.min}:1`),
  );
}

/* The tests -------------------------------------------------------------------------------- */

describe('contrast: the calculator', () => {
  it('reproduces the reference ratios of WCAG', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#ffffff')).toBe(1);
    // The well-known boundary greys on white: #767676 passes AA, #777777 just misses.
    expect(contrast('#767676', '#ffffff')).toBeGreaterThanOrEqual(TEXT);
    expect(contrast('#777777', '#ffffff')).toBeLessThan(TEXT);
    expect(contrast('#777', '#fff')).toBeCloseTo(contrast('#777777', '#ffffff'), 10);
  });

  it('converts rgb() and oklch() to the same sRGB values as their hex equivalents', () => {
    const hex = (value: string) => parseColor(value).map((c) => Math.round(c * 255));
    expect(hex('rgb(23 23 23)')).toEqual(hex('#171717'));
    expect(hex('rgb(100%, 0%, 50%)')).toEqual([255, 0, 128]);
    // Reference pairs from CSS Color Module Level 4.
    expect(hex('oklch(1 0 0)')).toEqual([255, 255, 255]);
    expect(hex('oklch(0 0 0)')).toEqual([0, 0, 0]);
    expect(hex('oklch(0.627955 0.257683 29.2339)')).toEqual([255, 0, 0]);
    expect(hex('oklch(51.9752% 0.176858 142.495)')).toEqual([0, 128, 0]);
    expect(hex('oklch(0.452014 0.313214 264.052)')).toEqual([0, 0, 255]);
  });

  it('follows var() references and rejects what it cannot read', () => {
    const tokens: Tokens = new Map([
      ['a', 'var(--b)'],
      ['b', '#123456'],
    ]);
    expect(resolve(tokens, 'a')).toBe('#123456');
    expect(() => resolve(tokens, 'missing')).toThrow(/not defined/);
    expect(() => parseColor('papayawhip')).toThrow(/Cannot parse/);
  });

  it('detects a failing pair (negative control)', () => {
    // The hairline that used to be the input border: far below 3:1, and the test must say so.
    const hairline: PairRow = {
      what: 'old input border',
      foregrounds: ['line-strong'],
      backgrounds: ['surface'],
      min: NON_TEXT,
    };
    expect(shortfalls(THEMES.light, hairline)).toEqual([
      'line-strong on surface is 1.48:1, needs 3:1',
    ]);
    expect(shortfalls(THEMES.dark, hairline)).toHaveLength(1);
    // The value --subtle had before the fix, on the light --hover surface: 4.24:1.
    const oldSubtle: PairRow = { ...hairline, foregrounds: ['#737373'], backgrounds: ['hover'] };
    expect(shortfalls(THEMES.light, { ...oldSubtle, min: TEXT })).toEqual([
      '#737373 on hover is 4.24:1, needs 4.5:1',
    ]);
  });
});

describe('contrast: the token table', () => {
  it('reads both themes from the stylesheet', () => {
    expect(resolve(THEMES.light, 'background')).toBe('#ffffff');
    expect(resolve(THEMES.dark, 'background')).toBe('#000000');
    expect([...THEMES.dark.keys()].sort()).toEqual([...THEMES.light.keys()].sort());
  });

  it('parses every row of the table', () => {
    expect(ROWS.length).toBeGreaterThanOrEqual(20);
    for (const row of ROWS) {
      expect(row.what).not.toBe('');
      expect(row.foregrounds.length).toBeGreaterThan(0);
      expect(row.backgrounds.length).toBeGreaterThan(0);
      expect([TEXT, NON_TEXT]).toContain(row.min);
    }
  });

  it('gives every AQI level a text-safe colour in both themes', () => {
    for (const tokens of Object.values(THEMES)) {
      for (let level = 0; level <= 5; level++) {
        expect(() => parseColor(resolve(tokens, `aqi-${level}-text`))).not.toThrow();
      }
    }
  });
});

describe.each(['light', 'dark'] as const)('contrast: %s theme', (theme) => {
  it.each(ROWS)('$what: $foregrounds on $backgrounds reaches $min:1', (row) => {
    expect(shortfalls(THEMES[theme], row)).toEqual([]);
  });

  it('keeps decorative dividers as hairlines: only control boundaries were darkened', () => {
    const tokens = THEMES[theme];
    expect(contrast(resolve(tokens, 'line'), resolve(tokens, 'surface'))).toBeLessThan(1.5);
    expect(contrast(resolve(tokens, 'line-strong'), resolve(tokens, 'surface'))).toBeLessThan(2);
  });
});

/* The other stylesheets -------------------------------------------------------------------- */

/** The declarations of the first rule whose selector is exactly `selector`. */
function ruleBody(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  return start === -1 ? '' : css.slice(start, css.indexOf('}', start));
}

/** A length declared as `property` in a rule, in CSS pixels (1rem is 16px). */
function declaredPx(rule: string, property: string): number {
  const value = new RegExp(`(?<![\\w-])${property}:\\s*([\\d.]+)(rem|px)`).exec(rule);
  return value ? Number(value[1]) * (value[2] === 'rem' ? 16 : 1) : 0;
}

describe('native controls (src/styles/controls.css)', () => {
  const css = readFileSync('src/styles/controls.css', 'utf8');

  it('draws the checkbox and both slider tracks with the field border', () => {
    expect(ruleBody(css, "input[type='checkbox']")).toMatch(/border:[^;]*var\(--field-border\)/);
    for (const track of ['::-webkit-slider-runnable-track', '::-moz-range-track']) {
      expect(ruleBody(css, `input[type='range']${track}`)).toContain(
        'background: var(--field-border)',
      );
    }
  });

  it('keeps the slider and the checkbox label at least 24 CSS pixels tall (WCAG 2.5.8)', () => {
    expect(declaredPx(ruleBody(css, "input[type='range']"), 'height')).toBeGreaterThanOrEqual(24);
    expect(
      declaredPx(ruleBody(css, "label:has(> input[type='checkbox'])"), 'min-height'),
    ).toBeGreaterThanOrEqual(24);
  });
});

describe('forced colours (src/styles/forced-colors.css)', () => {
  const css = readFileSync('src/styles/forced-colors.css', 'utf8');
  const block = css.slice(css.indexOf('@media (forced-colors: active)'));

  it('redraws focus, boundaries, selection, switches and status dots', () => {
    expect(block).not.toBe('');
    for (const selector of [
      ':focus-visible',
      "[role='radiogroup']",
      "[role='radio'][aria-checked='true']",
      '.ui-tab-indicator',
      "[role='switch'][aria-checked='true']",
      '.ui-switch-thumb',
      '.ui-dot',
      "input[type='checkbox']:checked",
    ]) {
      expect(block).toContain(selector);
    }
    expect(ruleBody(block, ':focus-visible:not(main)')).toContain('outline: 2px solid Highlight');
    expect(ruleBody(block, '.ui-dot')).toContain('forced-color-adjust: none');
  });

  it('paints with system colours only: no theme token and no literal colour', () => {
    expect(block).not.toMatch(/var\(--|#[0-9a-f]{3,8}\b|rgb\(|oklch\(/i);
  });
});
