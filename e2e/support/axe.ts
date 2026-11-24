/**
 * Runs axe-core inside the real browser, where colour contrast, focus order and computed roles
 * are the ones users get. The engine is injected from `node_modules/axe-core/axe.min.js`, so no
 * extra dependency and no network request is needed.
 *
 * `KNOWN_ISSUES` is the place to park a violation that is understood but not yet fixed: it is
 * reported on the test as an annotation instead of failing it. The list is empty today, so every
 * violation axe finds fails the test.
 */
import { fileURLToPath } from 'node:url';
import { test, type Page } from '@playwright/test';
import type axe from 'axe-core';

declare global {
  interface Window {
    /** Present once `axe.min.js` has been injected into the page. */
    axe: typeof axe;
  }
}

const AXE_SCRIPT = fileURLToPath(
  new URL('../../node_modules/axe-core/axe.min.js', import.meta.url),
);

/** One element that breaks one axe rule. */
interface Finding {
  rule: string;
  impact: string;
  help: string;
  /** CSS selector axe gives for the element. */
  target: string;
  /** The element's aria-label and text, which is how known issues are recognised. */
  label: string;
}

/** A violation that exists in `src/` today, matched by rule and by the element's label. */
interface KnownIssue {
  rule: string;
  label: RegExp;
  why: string;
}

const KNOWN_ISSUES: readonly KnownIssue[] = [];

const describe = (f: Finding) =>
  `${f.rule} (${f.impact}): ${f.help} -> ${f.target} "${f.label.slice(0, 80)}"`;

async function findings(page: Page): Promise<Finding[]> {
  await page.addScriptTag({ path: AXE_SCRIPT });
  return page.evaluate(async () => {
    const { violations } = await window.axe.run(document, { resultTypes: ['violations'] });
    return violations.flatMap((violation) =>
      violation.nodes.map((node) => {
        const target = node.target.join(' ');
        const element = document.querySelector(target);
        const label = `${element?.getAttribute('aria-label') ?? ''} ${element?.textContent ?? ''}`;
        return {
          rule: violation.id,
          impact: violation.impact ?? 'unknown',
          help: violation.help,
          target,
          label: label.trim(),
        };
      }),
    );
  });
}

/**
 * Audits the page and returns one line per unexpected violation; an empty array is a pass.
 * Known issues are attached to the running test as annotations so reports still show them.
 */
export async function axeViolations(page: Page): Promise<string[]> {
  const unexpected: string[] = [];
  for (const finding of await findings(page)) {
    const known = KNOWN_ISSUES.find((k) => k.rule === finding.rule && k.label.test(finding.label));
    if (known) test.info().annotations.push({ type: 'known a11y issue', description: known.why });
    else unexpected.push(describe(finding));
  }
  return unexpected;
}
