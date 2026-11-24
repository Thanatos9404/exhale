// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Documentation is evidence only while it is true. These tests fail when a document cites a file
 * that no longer exists or quotes a limit that the tooling no longer enforces.
 */

const CRITERION_DOCS = [
  'CODE_QUALITY.md',
  'SECURITY.md',
  'EFFICIENCY.md',
  'TESTING.md',
  'ACCESSIBILITY.md',
  'PROBLEM_ALIGNMENT.md',
];

const markdownFiles = [
  ...readdirSync('.').filter((name) => name.endsWith('.md')),
  ...readdirSync('docs')
    .filter((name) => name.endsWith('.md'))
    .map((name) => join('docs', name)),
];

/** True when a Markdown table row starts with these cells, whatever padding Prettier added. */
function hasRow(doc: string, ...cells: string[]): boolean {
  const escaped = cells.map((cell) => cell.replace(/[.*+?^${}()|[\]\\]/g, (char) => `\\${char}`));
  return new RegExp(`^\\|\\s*${escaped.join('\\s*\\|\\s*')}(?=\\s|\\|)`, 'm').test(doc);
}

/** Relative link targets in a Markdown file, without anchors; web links are skipped. */
function localLinks(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  return [...text.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((match) => match[1] ?? '')
    .filter((target) => !/^(https?:|mailto:|#)/.test(target))
    .map((target) => target.split('#')[0] ?? '')
    .filter((target) => target !== '');
}

describe('documentation stays true', () => {
  it('has one evidence document per judging criterion', () => {
    expect(CRITERION_DOCS.filter((doc) => !existsSync(doc))).toEqual([]);
  });

  it.each(markdownFiles)('%s links only to files that exist', (file) => {
    const broken = localLinks(file).filter((target) => !existsSync(join(dirname(file), target)));
    expect(broken).toEqual([]);
  });

  it('quotes the lint limits that eslint.config.js enforces', () => {
    const config = readFileSync('eslint.config.js', 'utf8');
    const doc = readFileSync('CODE_QUALITY.md', 'utf8');
    const limit = (rule: string) => {
      const found = new RegExp(`'?${rule}'?: \\['error', (?:\\{ max: )?(\\d+)`).exec(config);
      return found?.[1] ?? 'missing';
    };
    for (const rule of [
      'max-lines',
      'max-lines-per-function',
      'max-params',
      'max-depth',
      'complexity',
    ]) {
      expect(hasRow(doc, `\`${rule}\``, limit(rule)), `${rule} limit`).toBe(true);
    }
  });

  it('quotes the bundle budgets that the build script enforces', () => {
    const script = readFileSync('scripts/check-bundle.mjs', 'utf8');
    const doc = readFileSync('EFFICIENCY.md', 'utf8');
    for (const key of ['initialJs', 'css', 'routeChunk']) {
      const budget = new RegExp(`${key}: (\\d+)`).exec(script)?.[1] ?? 'missing';
      expect(new RegExp(`\\|\\s*${budget} kB\\s*\\|`).test(doc), `${key} budget`).toBe(true);
    }
  });

  it('quotes the coverage thresholds that vite.config.ts enforces', () => {
    const config = readFileSync('vite.config.ts', 'utf8');
    const doc = readFileSync('TESTING.md', 'utf8');
    for (const metric of ['statements', 'branches', 'functions', 'lines']) {
      const threshold = new RegExp(`${metric}: (\\d+)`).exec(config)?.[1] ?? 'missing';
      expect(hasRow(doc, metric, `${threshold}%`), `${metric} threshold`).toBe(true);
    }
  });
});
