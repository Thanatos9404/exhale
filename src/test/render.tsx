/**
 * Render helpers for component tests: mount UI inside the same providers the app uses, at an
 * in-memory route, and check the result with axe-core.
 */
import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import axe from 'axe-core';
import { AppStateProvider } from '@/state/AppState';
import { DeploymentsProvider } from '@/state/Deployments';
import { CommandMenuProvider } from '@/components/shell/CommandMenu';

/** Renders UI inside every provider the app uses, at an in-memory route. */
export function renderApp(ui: ReactElement, { path = '/' }: { path?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { hook } = memoryLocation({ path });
  return render(
    <QueryClientProvider client={client}>
      <Router hook={hook}>
        <AppStateProvider>
          <DeploymentsProvider>
            <CommandMenuProvider>{ui}</CommandMenuProvider>
          </DeploymentsProvider>
        </AppStateProvider>
      </Router>
    </QueryClientProvider>,
  );
}

/** Runs axe-core and returns violations. Colour contrast is skipped: jsdom cannot compute styles. */
export async function axeViolations(container: Element) {
  const results = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  return results.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
}
