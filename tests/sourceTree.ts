import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';

/** Reads the repository's own source so architecture and convention rules can be tested. */

export interface SourceFile {
  /** Repo-relative path with forward slashes, for example `src/lib/air/aqi.ts`. */
  path: string;
  text: string;
  isTest: boolean;
}

const SOURCE_ROOTS = ['src', 'server', 'api', 'scripts', 'e2e'];
const SOURCE_FILE = /\.(ts|tsx|mjs)$/;
const TEST_FILE = /\.test\.tsx?$|\.spec\.ts$|^src\/test\//;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** Every source and test module under the source roots. */
export function sourceFiles(): SourceFile[] {
  return SOURCE_ROOTS.flatMap(walk)
    .map((file) => file.split('\\').join('/'))
    .filter((path) => SOURCE_FILE.test(path))
    .map((path) => ({ path, text: readFileSync(path, 'utf8'), isTest: TEST_FILE.test(path) }));
}

const IMPORT_SPECIFIER =
  /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;

/**
 * Where each import of a file points: a repo-relative path for local modules (`src/lib/cn`),
 * or `pkg:<name>` for packages and Node built-ins.
 */
export function importsOf(file: SourceFile): string[] {
  return [...file.text.matchAll(IMPORT_SPECIFIER)].map((match) => {
    const specifier = match[1] ?? match[2] ?? match[3] ?? '';
    if (specifier.startsWith('@/')) return `src/${specifier.slice(2)}`;
    if (specifier.startsWith('.'))
      return posix.normalize(posix.join(dirname(file.path), specifier));
    return `pkg:${specifier}`;
  });
}
