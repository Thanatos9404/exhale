// @vitest-environment node
import type { GenerateContentResponse } from '@google/genai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setClient, type GenAiLike } from './candidates';
import { collectSources, formatSources, safeLink } from './sources';
import { streamText } from './stream';

const list = (entries: [string, string][]) => formatSources(new Map(entries));

/** The destination of every Markdown link in the text, as a renderer would read it. */
const destinations = (markdown: string) =>
  [...markdown.matchAll(/\]\(([^)\s]*)\)/g)].map((match) => match[1]);

describe('safeLink', () => {
  it('keeps an ordinary https address as it is', () => {
    expect(safeLink('https://example.org/grap?stage=3#rules')).toBe(
      'https://example.org/grap?stage=3#rules',
    );
  });

  it.each([
    'http://example.org/insecure',
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    '//example.org/protocol-relative',
    '/relative/path',
    'not a url',
    '',
  ])('refuses %s', (uri) => {
    expect(safeLink(uri)).toBeNull();
  });

  it('encodes every character that could end or restructure the link', () => {
    const link = safeLink('https://example.org/a(b)c[d]e\'f?q=1 2&x=<y>"`') ?? '';
    expect(link).not.toMatch(/[()[\]<>\\`"'\s]/);
    expect(link).toContain('%28b%29');
    expect(link.startsWith('https://example.org/')).toBe(true);
  });
});

describe('formatSources', () => {
  it('lists only https pages', () => {
    const out = list([
      ['javascript:alert(document.cookie)', 'Click me'],
      ['http://example.org/plain', 'Plain http'],
      ['https://example.org/ok', 'Fine'],
    ]);
    expect(out).toBe('\n\n**Sources**\n- [Fine](https://example.org/ok)');
  });

  it('returns nothing when no cited address is safe to link', () => {
    expect(list([['javascript:alert(1)', 'x']])).toBe('');
    expect(list([])).toBe('');
  });

  it('cannot be broken out of with a closing parenthesis in the address', () => {
    const out = list([['https://example.org/a) [evil](javascript:alert(1)', 'Report']]);
    expect(destinations(out)).toEqual([
      'https://example.org/a%29%20%5Bevil%5D%28javascript:alert%281%29',
    ]);
  });

  it('cannot be broken out of with brackets, backslashes or new lines in the title', () => {
    const out = list([['https://example.org/x', 'A](javascript:alert(1)) \\\n\n# Heading [b]']]);
    expect(out).toBe(
      '\n\n**Sources**\n- [A(javascript:alert(1)) # Heading b](https://example.org/x)',
    );
    expect(destinations(out)).toEqual(['https://example.org/x']);
    expect(out.split('\n').filter((line) => line.startsWith('- '))).toHaveLength(1);
  });

  it('falls back to the host name when nothing is left of the title, and caps long titles', () => {
    expect(list([['https://example.org/x', '[]']])).toContain('- [example.org](');
    const long = list([['https://example.org/x', 'T'.repeat(500)]]);
    expect(long).toContain(`[${'T'.repeat(120)}]`);
    expect(long).not.toContain('T'.repeat(121));
  });

  it('counts the five-source limit over safe links only', () => {
    const entries: [string, string][] = [
      ['javascript:alert(1)', 'bad'],
      ...Array.from({ length: 7 }, (_, i): [string, string] => [
        `https://example.org/${i}`,
        `P${i}`,
      ]),
    ];
    const out = list(entries);
    expect(out.match(/^- /gm)).toHaveLength(5);
    expect(out).toContain('[P4](https://example.org/4)');
  });
});

describe('collectSources and the stream', () => {
  afterEach(() => setClient(undefined));

  const cite = (uri: string | undefined, title?: string) =>
    ({
      candidates: [{ groundingMetadata: { groundingChunks: [{ web: { uri, title } }] } }],
    }) as const;
  /** Test chunks are plain objects carrying only the fields the code reads. */
  const chunk = (value: unknown) => value as GenerateContentResponse;

  it('keys cited pages by address and falls back to the address as the title', () => {
    const into = new Map<string, string>();
    collectSources(chunk(cite('https://example.org/a', 'A')), into);
    collectSources(chunk(cite('https://example.org/b')), into);
    collectSources(chunk(cite(undefined, 'no address')), into);
    collectSources(chunk({}), into);
    expect([...into]).toEqual([
      ['https://example.org/a', 'A'],
      ['https://example.org/b', 'https://example.org/b'],
    ]);
  });

  it('appends no Sources block when grounding cites only unsafe addresses', async () => {
    async function* answer() {
      yield { ...cite('javascript:alert(1)', 'GRAP'), text: 'Stage 3 is in force.' };
    }
    const client = {
      models: { generateContent: vi.fn(), generateContentStream: vi.fn(async () => answer()) },
    } as unknown as GenAiLike;
    let out = '';
    for await (const piece of streamText({ system: 's', contents: [], search: true, client }))
      out += piece;
    expect(out).toBe('Stage 3 is in force.');
  });
});
