/**
 * Performance budget for the production build. Run after `vite build`; exits non-zero when a
 * budget is exceeded, so CI fails before a regression ships.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = 'dist';
const ASSETS = join(DIST, 'assets');
const KB = 1024;

/** Budgets in gzipped kB. Measured sizes at the time of writing are in EFFICIENCY.md. */
const BUDGET = {
  /** Everything the browser needs before first paint: entry chunk plus its preloaded vendors. */
  initialJs: 170,
  css: 15,
  /** Any single route chunk, loaded on navigation. */
  routeChunk: 25,
};

/** Heavy libraries that must stay out of the first load and arrive only when a view needs them. */
const LAZY_ONLY = ['three', 'gsap', 'markdown', 'motion', 'ui'];
const ROUTES = ['Overview', 'Forecast', 'Routine', 'Impact', 'Indoor', 'Assistant', 'Settings'];

const gzipKb = (file) => gzipSync(readFileSync(join(ASSETS, file))).length / KB;
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const referenced = [...html.matchAll(/(?:src|href)="\/assets\/([^"]+)"/g)].map((m) => m[1]);
const files = readdirSync(ASSETS);

const initialJs = referenced.filter((f) => f.endsWith('.js'));
const initialCss = referenced.filter((f) => f.endsWith('.css'));
const sum = (list) => list.reduce((total, f) => total + gzipKb(f), 0);

const failures = [];
const report = [];
const check = (label, actual, limit) => {
  report.push(`${label.padEnd(34)} ${actual.toFixed(1).padStart(7)} kB  (budget ${limit} kB)`);
  if (actual > limit)
    failures.push(`${label} is ${actual.toFixed(1)} kB gzip, over the ${limit} kB budget`);
};

check('Initial JavaScript', sum(initialJs), BUDGET.initialJs);
check('Stylesheet', sum(initialCss), BUDGET.css);
for (const route of ROUTES) {
  const chunk = files.find((f) => f.startsWith(`${route}-`) && f.endsWith('.js'));
  if (chunk) check(`Route chunk ${route}`, gzipKb(chunk), BUDGET.routeChunk);
}
for (const name of LAZY_ONLY) {
  const preloaded = initialJs.some((f) => f.startsWith(`${name}-`));
  report.push(`${`Lazy-only chunk ${name}`.padEnd(34)} ${preloaded ? 'PRELOADED' : 'deferred'}`);
  if (preloaded)
    failures.push(`${name} is loaded on first paint; it must stay behind a dynamic import`);
}

console.log(report.join('\n'));
if (failures.length > 0) {
  console.error(`\nBundle budget failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nBundle budget passed.');
