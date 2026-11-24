/**
 * The `test` every spec imports instead of Playwright's own.
 *
 * It adds one automatic fixture, `network`, which before each test installs the route mocker and
 * pins the clock to the fixture's "now", and after each test fails it if any request tried to
 * reach the real network or the page threw an uncaught error.
 */
import { test as base, expect } from '@playwright/test';
import { NOW } from './fixtures';
import { MockNetwork } from './mockNetwork';

interface Fixtures {
  /** The route mocker for this test's page. */
  network: MockNetwork;
}

export const test = base.extend<Fixtures>({
  network: [
    // The second argument is Playwright's `use` callback, renamed so it is not read as a React hook.
    async ({ page }, provide) => {
      const network = new MockNetwork();
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await network.install(page);
      // `Date.now()` is the fixture's current hour for the whole test; timers still run.
      await page.clock.setFixedTime(NOW);

      await provide(network);

      network.release();
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      expect(network.escaped, 'requests that tried to reach the real network').toEqual([]);
      expect(pageErrors, 'uncaught errors thrown in the page').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
