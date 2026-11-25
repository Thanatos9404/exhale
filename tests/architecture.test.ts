// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { importsOf, sourceFiles, type SourceFile } from './sourceTree';

/**
 * The layering in docs/ARCHITECTURE.md, enforced. A layer may import the layers below it and
 * never sideways or upwards, so the pure engine stays free of UI and the server stays free of React.
 */

interface LayerRule {
  name: string;
  /** Files the rule applies to. */
  files: RegExp;
  /** Import targets those files must never reach. */
  forbidden: RegExp[];
}

const UI_PACKAGES =
  /^pkg:(react|react-dom|motion|gsap|three|@react-three|@gsap|cmdk|sonner|wouter|lucide-react)/;
const UI_LAYERS = /^src\/(components|pages|state|hooks)\//;
const AI_SDKS = /^pkg:(@google\/genai|@anthropic-ai\/sdk)/;
/** The Firebase web SDK (app, App Check, AI Logic): browser-only, behind src/services/firebase. */
const FIREBASE_SDK = /^pkg:(firebase|@firebase)(\/|$)/;

const RULES: LayerRule[] = [
  {
    name: 'src/lib is pure logic: no UI code, no UI packages, no AI SDKs, no services',
    files: /^src\/lib\//,
    forbidden: [
      UI_LAYERS,
      UI_PACKAGES,
      AI_SDKS,
      FIREBASE_SDK,
      /^src\/services\//,
      /^(server|api)\//,
    ],
  },
  {
    name: 'src/services wraps browser SDKs for the UI: it uses src/lib and never the UI',
    files: /^src\/services\//,
    forbidden: [UI_LAYERS, UI_PACKAGES, AI_SDKS, /^(server|api)\//],
  },
  {
    name: 'only src/services/firebase imports the Firebase SDK',
    files: /^(src\/(?!services\/firebase\/)|server\/|api\/)/,
    forbidden: [FIREBASE_SDK],
  },
  {
    name: 'server is framework-free: it uses src/lib and never the UI or browser services',
    files: /^server\//,
    forbidden: [UI_LAYERS, UI_PACKAGES, /^src\/services\//, /^api\//],
  },
  {
    name: 'api handlers are thin: they call server and src/lib only',
    files: /^api\//,
    forbidden: [UI_LAYERS, UI_PACKAGES, AI_SDKS, /^src\/services\//],
  },
  {
    name: 'the browser never imports server code or AI SDKs',
    files: /^src\//,
    forbidden: [/^(server|api)\//, AI_SDKS],
  },
  {
    name: 'state and hooks sit below components and pages',
    files: /^src\/(state|hooks)\//,
    forbidden: [/^src\/(components|pages)\//],
  },
  {
    name: 'shared components never import pages',
    files: /^src\/components\//,
    forbidden: [/^src\/pages\//],
  },
];

const production = sourceFiles().filter((file) => !file.isTest);

function violations(rule: LayerRule, files: SourceFile[]): string[] {
  return files
    .filter((file) => rule.files.test(file.path))
    .flatMap((file) =>
      importsOf(file)
        .filter((target) => rule.forbidden.some((pattern) => pattern.test(target)))
        .map((target) => `${file.path} imports ${target}`),
    );
}

describe('architecture: layer boundaries', () => {
  it('finds the source tree', () => {
    expect(production.length).toBeGreaterThan(100);
  });

  it.each(RULES)('$name', (rule) => {
    expect(violations(rule, production)).toEqual([]);
  });

  it('keeps each page folder private to its own page', () => {
    const crossImports = production
      .filter((file) => /^src\/pages\/[a-z]+\//.test(file.path))
      .flatMap((file) => {
        const own = file.path.split('/').slice(0, 3).join('/');
        return importsOf(file)
          .filter((target) => /^src\/pages\/[a-z]+\//.test(target) && !target.startsWith(`${own}/`))
          .map((target) => `${file.path} imports ${target}`);
      });
    expect(crossImports).toEqual([]);
  });

  it('loads the Firebase SDK only on demand, never in a static import', () => {
    const staticImport = /^\s*import\s+(?!type\b)[^'"]*from\s+['"](firebase|@firebase)[/'"]/m;
    const eager = production
      .filter((file) => staticImport.test(file.text))
      .map((file) => file.path);
    expect(eager).toEqual([]);
  });

  it('has no import cycles between the layers of src/lib', () => {
    // science and air are the base; profile sits beside them; the planner is on top.
    const upward = production
      .filter((file) => /^src\/lib\/(science|air|profile)\//.test(file.path))
      .flatMap((file) =>
        importsOf(file)
          .filter((target) => target.startsWith('src/lib/planner/'))
          .map((target) => `${file.path} imports ${target}`),
      );
    expect(upward).toEqual([]);
  });
});
