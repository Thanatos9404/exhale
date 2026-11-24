// @vitest-environment node
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { sourceFiles } from './sourceTree';

/** Repository-wide conventions that lint cannot express, checked against the real files. */

const all = sourceFiles();
const production = all.filter((file) => !file.isTest);
const offenders = (pattern: RegExp, files = production) =>
  files.filter((file) => pattern.test(file.text)).map((file) => file.path);

describe('conventions: security', () => {
  it('contains no hardcoded API keys or tokens, in source or tests', () => {
    const secret =
      /AIza[0-9A-Za-z_-]{30,}|sk-ant-[0-9A-Za-z_-]{30,}|ghp_[0-9A-Za-z]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/;
    expect(offenders(secret, all)).toEqual([]);
  });

  it('reads environment variables only on the server and in build tooling', () => {
    const readers = offenders(/process\.env|import\.meta\.env\.(?!DEV|PROD|MODE|BASE_URL)/);
    expect(readers.filter((path) => path.startsWith('src/'))).toEqual([]);
  });

  it('never injects raw HTML or evaluates strings as code', () => {
    expect(offenders(/dangerouslySetInnerHTML|\.innerHTML\s*=|\beval\(|new Function\(/)).toEqual(
      [],
    );
  });

  it('writes to the console only through the server logger', () => {
    const writers = offenders(/\bconsole\.(log|info|debug|warn|error)\(/);
    expect(writers.filter((path) => !path.startsWith('scripts/'))).toEqual(['server/log.ts']);
  });
});

describe('conventions: maintainability', () => {
  it('has no lint or type-check escape hatches', () => {
    expect(offenders(/eslint-disable|@ts-ignore|@ts-expect-error|@ts-nocheck/)).toEqual([]);
  });

  it('never uses the any type in production code', () => {
    expect(offenders(/:\s*any\b|\bas any\b|<any>/)).toEqual([]);
  });

  it('leaves no unfinished-work markers behind', () => {
    expect(offenders(/\b(TODO|FIXME|HACK|XXX)\b/, all)).toEqual([]);
  });

  it('documents every production module with at least one doc comment', () => {
    const undocumented = production
      .filter((file) => !file.path.endsWith('.mjs'))
      .filter((file) => !file.text.includes('/**'))
      .map((file) => file.path);
    expect(undocumented).toEqual([]);
  });

  it('opens every production module with a doc comment that states its one job', () => {
    const mayPrecedeHeader = (line: string) =>
      line === '' || line.startsWith('/// <reference') || line.startsWith('// @vitest-environment');
    const firstLine = (text: string) =>
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => !mayPrecedeHeader(line)) ?? '';
    const headerless = production
      .filter((file) => !firstLine(file.text).startsWith('/**'))
      .map((file) => file.path);
    expect(headerless).toEqual([]);
  });

  it('keeps every production module under 250 lines in total', () => {
    const long = production
      .map((file) => ({ path: file.path, lines: file.text.split('\n').length }))
      .filter((file) => file.lines > 250)
      .map((file) => `${file.path} (${file.lines} lines)`);
    expect(long).toEqual([]);
  });
});

const vercelSchema = z.object({
  regions: z.array(z.string()),
  rewrites: z.array(z.object({ source: z.string(), destination: z.string() })),
  headers: z.array(
    z.object({
      source: z.string(),
      headers: z.array(z.object({ key: z.string(), value: z.string() })),
    }),
  ),
});

describe('conventions: delivery', () => {
  const vercel = vercelSchema.parse(JSON.parse(readFileSync('vercel.json', 'utf8')));
  const headersFor = (source: string) =>
    new Map(
      vercel.headers
        .filter((rule) => rule.source === source)
        .flatMap((rule) => rule.headers.map((header) => [header.key, header.value] as const)),
    );
  const site = headersFor('/(.*)');
  const csp = new Map(
    (site.get('Content-Security-Policy') ?? '').split(';').map((directive) => {
      const [name = '', ...values] = directive.trim().split(/\s+/);
      return [name, values.join(' ')] as const;
    }),
  );

  it('sends every security header with its strict value on every route', () => {
    expect(site.get('X-Frame-Options')).toBe('DENY');
    expect(site.get('X-Content-Type-Options')).toBe('nosniff');
    expect(site.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(site.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(site.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
    expect(site.get('Permissions-Policy')).toContain('camera=()');
  });

  it('enforces HTTPS for at least a year, subdomains included', () => {
    const hsts = site.get('Strict-Transport-Security') ?? '';
    const maxAge = Number(/max-age=(\d+)/.exec(hsts)?.[1] ?? 0);
    expect(maxAge).toBeGreaterThanOrEqual(365 * 24 * 60 * 60);
    expect(hsts).toContain('includeSubDomains');
  });

  it('allows scripts from this origin only: no inline script, no eval', () => {
    expect(csp.get('script-src')).toBe("'self'");
    expect(csp.get('default-src')).toBe("'self'");
  });

  it('blocks framing, plugins, base-tag hijacking and foreign form targets', () => {
    expect(csp.get('frame-ancestors')).toBe("'none'");
    expect(csp.get('object-src')).toBe("'none'");
    expect(csp.get('base-uri')).toBe("'self'");
    expect(csp.get('form-action')).toBe("'self'");
    expect(csp.has('upgrade-insecure-requests')).toBe(true);
  });

  it('lets the browser connect only to this origin and the named data APIs', () => {
    const hosts = (csp.get('connect-src') ?? '').split(' ').filter((host) => host !== "'self'");
    expect(hosts.every((host) => /^https:\/\/[a-z0-9.-]+$/.test(host))).toBe(true);
    expect(hosts.every((host) => /open-meteo\.com$|bigdatacloud\.net$/.test(host))).toBe(true);
  });

  it('never rewrites API or asset URLs to the app shell, so a missing chunk is a real 404', () => {
    const [shell] = vercel.rewrites;
    expect(vercel.rewrites).toHaveLength(1);
    expect(shell?.destination).toBe('/index.html');
    const pattern = new RegExp(`^${shell?.source ?? ''}$`);
    expect(pattern.test('/forecast')).toBe(true);
    expect(pattern.test('/api/plan')).toBe(false);
    expect(pattern.test('/assets/missing-abc123.js')).toBe(false);
  });

  it('caches hashed assets for a year as immutable', () => {
    expect(headersFor('/assets/(.*)').get('Cache-Control')).toBe(
      'public, max-age=31536000, immutable',
    );
  });

  it('gives every test-free source folder in src/lib a test beside it', () => {
    const folders = new Set(
      production
        .filter((f) => f.path.startsWith('src/lib/'))
        .map((f) => f.path.split('/').slice(0, 3).join('/')),
    );
    const tested = new Set(
      all.filter((f) => f.isTest).map((f) => f.path.split('/').slice(0, 3).join('/')),
    );
    const untested = [...folders].filter(
      (folder) => !folder.endsWith('.ts') && !tested.has(folder),
    );
    expect(untested).toEqual([]);
  });
});
