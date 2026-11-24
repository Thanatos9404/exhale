import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import App from '@/App';
import { AppStateProvider } from '@/state/AppState';
import { DeploymentsProvider } from '@/state/Deployments';
import { axeViolations } from '@/test/render';
import { makeSnapshot } from '@/test/fixtures';
import { fetchAirSnapshot } from '@/lib/air/openMeteo';
import { buildPlan } from '@/lib/planner/engine';
import { DEFAULT_HOUSEHOLD } from '@/lib/profile/schema';
import type * as OpenMeteo from '@/lib/air/openMeteo';

/**
 * Accessibility checks for every route, rendered through the real app frame (skip link, header,
 * tabs, main, footer) with the network mocked. WebGL does not exist in jsdom, so the 3D views
 * fall back to their text alternative, exactly as in pages.test.tsx.
 */

/**
 * jsdom has no matchMedia. This one answers the reduced-motion queries from a switch the tests
 * flip, and notifies subscribers, because the app listens for changes to the preference. It
 * reports a desktop-width viewport, where the header shows its AI status badge (and so runs the
 * health check that `mountPage` waits for).
 */
const { setReducedMotion } = vi.hoisted(() => {
  let reduced = false;
  const subscribers = new Set<() => void>();
  const matches = (query: string) => {
    if (query.includes('min-width')) return true;
    if (!query.includes('prefers-reduced-motion')) return false;
    return query.includes('no-preference') ? !reduced : reduced;
  };
  window.matchMedia = (query: string) =>
    ({
      media: query,
      get matches() {
        return matches(query);
      },
      onchange: null,
      addEventListener: (_type: string, listener: () => void) => subscribers.add(listener),
      removeEventListener: (_type: string, listener: () => void) => subscribers.delete(listener),
      addListener: (listener: () => void) => subscribers.add(listener),
      removeListener: (listener: () => void) => subscribers.delete(listener),
      dispatchEvent: () => true,
    }) as unknown as MediaQueryList;
  // The app scrolls to the top on navigation; jsdom only logs "not implemented".
  window.scrollTo = () => {};
  return {
    setReducedMotion: (on: boolean) => {
      reduced = on;
      subscribers.forEach((notify) => notify());
    },
  };
});

vi.mock('@/lib/air/openMeteo', async (orig) => {
  const actual = await orig<typeof OpenMeteo>();
  return {
    ...actual,
    fetchAirSnapshot: vi.fn(async () => makeSnapshot()),
    searchPlaces: vi.fn(async () => []),
  };
});

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

/** A promise the test resolves by hand, to hold a request open while it inspects the UI. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/** A chat response whose body the test feeds chunk by chunk. */
function controlledChat() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) });
  const encoder = new TextEncoder();
  return {
    response: new Response(body, { headers: { 'x-exhale-source': 'rules' } }),
    push: (text: string) => controller.enqueue(encoder.encode(text)),
    close: () => controller.close(),
  };
}

/** What the fake API answers; tests swap these to slow a request down. */
const api = {
  plan: async (): Promise<Response> =>
    json({
      plan: buildPlan(DEFAULT_HOUSEHOLD, makeSnapshot()),
      ai: null,
      source: 'rules',
      model: null,
    }),
  chat: async (_signal?: AbortSignal | null): Promise<Response> =>
    new Response('Open the windows after 1 pm.'),
};
const defaults = { ...api };

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

// Health, plan and chat calls never leave the test.
vi.stubGlobal(
  'fetch',
  vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlOf(input);
    if (url.includes('/api/plan')) return api.plan();
    if (url.includes('/api/chat')) return api.chat(init?.signal);
    return json({ ok: true, ai: false, model: null });
  }),
);

beforeEach(() => {
  Object.assign(api, defaults);
  setReducedMotion(false);
});

afterEach(() => {
  setReducedMotion(false);
});

interface PageCase {
  path: string;
  /** The h1 and the label of the page's tab. */
  title: string;
  /** Resolves once the page shows live data. */
  ready: () => Promise<unknown>;
  /** The control a keyboard user comes to this page for. */
  primary: () => HTMLElement;
}

/** Lazy routes load their chunk first; coverage instrumentation makes that slower than 1 s. */
const LAZY_ROUTE = { timeout: 10_000 };

const PAGES: PageCase[] = [
  {
    path: '/',
    title: 'Overview',
    ready: () => screen.findByText(/air can only mix/),
    primary: () => screen.getByRole('button', { name: 'Deploy today’s routine' }),
  },
  {
    path: '/forecast',
    title: 'Forecast',
    ready: () => screen.findByRole('img', { name: /past 12 hours/ }, LAZY_ROUTE),
    primary: () => screen.getByRole('img', { name: /past 12 hours/ }),
  },
  {
    path: '/routine',
    title: 'Routine',
    ready: () => screen.findByRole('button', { name: 'Deploy with Gemini' }, LAZY_ROUTE),
    primary: () => screen.getByRole('button', { name: 'Deploy with Gemini' }),
  },
  {
    path: '/impact',
    title: 'Impact',
    ready: () => screen.findByRole('switch', { name: /Apply: Swap the mosquito coil/ }),
    primary: () => screen.getAllByRole('switch', { name: /^Apply: / })[0]!,
  },
  {
    path: '/indoor',
    title: 'Indoor lab',
    ready: () => screen.findByText(/Live reading here: 170/),
    primary: () => screen.getByRole('button', { name: 'Reset to my home' }),
  },
  {
    path: '/assistant',
    title: 'Assistant',
    ready: () => screen.findByText(/New Delhi, India: AQI \d+/),
    primary: () => screen.getByRole('textbox', { name: 'Ask Exhale' }),
  },
  {
    path: '/settings',
    title: 'Settings',
    ready: () => screen.findByRole('region', { name: 'General' }),
    primary: () => screen.getByRole('textbox', { name: 'Household name' }),
  },
];

const page = (path: string) => PAGES.find((p) => p.path === path)!;

/**
 * Renders the whole app at a route. `renderApp` from the shared helpers adds its own command
 * menu provider, and `App` brings one too; two of them would open two dialogs on Ctrl+K, so
 * these tests mount `App` inside the same providers as `main.tsx` instead.
 */
function renderRoute(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { hook } = memoryLocation({ path });
  return render(
    <QueryClientProvider client={client}>
      <Router hook={hook}>
        <AppStateProvider>
          <DeploymentsProvider>
            <App />
          </DeploymentsProvider>
        </AppStateProvider>
      </Router>
    </QueryClientProvider>,
  );
}

/** Renders a route and waits until its data, and the header's health check, have loaded. */
async function mountPage(target: PageCase) {
  const view = renderRoute(target.path);
  await target.ready();
  await screen.findByText('Rules mode');
  return view;
}

/** Elements with one of these roles whose accessible name is empty, as short HTML snippets. */
function unnamed(roles: readonly string[]): string[] {
  return roles
    .flatMap((role) => screen.queryAllByRole(role, { name: (name) => name.trim() === '' }))
    .map((el) => el.outerHTML.slice(0, 160));
}

/** The button that expands the first routine action; its panel id starts with "row-". */
function firstRoutineRow(): HTMLElement {
  const toggle = screen
    .getAllByRole('button', { expanded: false })
    .find((button) => button.getAttribute('aria-controls')?.startsWith('row-'));
  expect(toggle).toBeDefined();
  return toggle!;
}

/** Presses Tab until `target` has focus. Returns how many presses it took, or -1. */
async function tabTo(user: UserEvent, target: HTMLElement, limit = 90): Promise<number> {
  for (let presses = 1; presses <= limit; presses++) {
    await user.tab();
    if (document.activeElement === target) return presses;
  }
  return -1;
}

describe.each(PAGES)('$title page ($path)', (target) => {
  it('has no axe violations once data has loaded', async () => {
    const { container } = await mountPage(target);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('has exactly one h1, and a document title that names the page', async () => {
    await mountPage(target);
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(target.title);
    expect(document.title).toContain(target.path === '/' ? 'Exhale' : target.title);
  });

  it('has main, banner, footer and navigation landmarks, with the active tab marked', async () => {
    await mountPage(target);
    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
    expect(mains[0]).toContainElement(screen.getByRole('heading', { level: 1 }));
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();

    const nav = screen.getByRole('navigation', { name: 'Primary' });
    const current = within(nav).getAllByRole('link', { current: 'page' });
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName(target.title);
    expect(within(nav).getAllByRole('link')).toHaveLength(PAGES.length);
  });

  it('gives every button and link an accessible name', async () => {
    await mountPage(target);
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link').length).toBeGreaterThan(0);
    expect(unnamed(['button', 'link'])).toEqual([]);
  });

  it('labels every form control and every group of controls', async () => {
    const { container } = await mountPage(target);
    for (const control of container.querySelectorAll('input, select, textarea')) {
      expect(control).toHaveAccessibleName();
    }
    expect(
      unnamed([
        'textbox',
        'combobox',
        'slider',
        'spinbutton',
        'checkbox',
        'radio',
        'switch',
        'tab',
        'radiogroup',
        'group',
        'tablist',
        'tabpanel',
      ]),
    ).toEqual([]);
  });

  it('puts the skip link first in the tab order, and it moves focus to main', async () => {
    const user = userEvent.setup();
    await mountPage(target);
    await user.tab();
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip).toHaveFocus();
    expect(skip).toHaveAttribute('href', '#main');

    await user.keyboard('{Enter}');
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main');
    expect(main).toHaveFocus();

    // The next Tab continues from the content, not from the header again.
    await user.tab();
    expect(main).toContainElement(document.activeElement as HTMLElement);
  });

  it('reaches the primary action with the Tab key alone', async () => {
    const user = userEvent.setup();
    await mountPage(target);
    const primary = target.primary();
    expect(await tabTo(user, primary)).toBeGreaterThan(0);
    expect(primary).toHaveFocus();
    expect(screen.getByRole('main')).toContainElement(primary);
  });
});

describe('primary navigation', () => {
  it('names the compact logo link that appears in the tab bar after scrolling', async () => {
    const { container } = await mountPage(page('/forecast'));
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    const before = within(nav).getAllByRole('link').length;

    Object.defineProperty(window, 'scrollY', { value: 200, configurable: true });
    try {
      fireEvent.scroll(window);
      await waitFor(() => expect(within(nav).getAllByRole('link')).toHaveLength(before + 1));
      expect(unnamed(['link'])).toEqual([]);
      expect(await axeViolations(container)).toEqual([]);
    } finally {
      Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    }
  });

  it('moves aria-current when a tab is followed with the keyboard', async () => {
    const user = userEvent.setup();
    await mountPage(page('/'));
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    const settings = within(nav).getByRole('link', { name: 'Settings' });
    expect(await tabTo(user, settings)).toBeGreaterThan(0);
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(settings).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getAllByRole('link', { current: 'page' })).toHaveLength(1);
  });
});

describe('forecast chart keyboard access', () => {
  it('reads values with the arrow, Home and End keys through its live region', async () => {
    const user = userEvent.setup();
    await mountPage(page('/forecast'));
    const chart = screen.getByRole('img', { name: /past 12 hours/ });
    expect(chart).toHaveAccessibleName(/Use left and right arrow keys/);
    const live = chart.parentElement!.querySelector('[aria-live="polite"]')!;
    expect(live).toBeInTheDocument();
    expect(live).toHaveTextContent('');
    const reading = /^.+: [\d,.]+ AQI$/;

    expect(await tabTo(user, chart)).toBeGreaterThan(0);
    await user.keyboard('{Home}');
    const first = live.textContent;
    expect(first).toMatch(reading);

    await user.keyboard('{ArrowRight}');
    const second = live.textContent;
    expect(second).toMatch(reading);
    expect(second).not.toBe(first);

    await user.keyboard('{ArrowLeft}');
    expect(live).toHaveTextContent(first);
    // The first hour is a hard stop.
    await user.keyboard('{ArrowLeft}');
    expect(live).toHaveTextContent(first);

    await user.keyboard('{End}');
    const last = live.textContent;
    expect(last).toMatch(reading);
    expect(last).not.toBe(first);
    await user.keyboard('{ArrowRight}');
    expect(live).toHaveTextContent(last);

    await user.keyboard('{Escape}');
    expect(live).toHaveTextContent('');
    expect(chart).toHaveFocus();
  });

  it('starts reading from the current hour and offers the same data as a table', async () => {
    const user = userEvent.setup();
    await mountPage(page('/forecast'));
    const chart = screen.getByRole('img', { name: /past 12 hours/ });
    const live = chart.parentElement!.querySelector('[aria-live="polite"]')!;
    chart.focus();
    await user.keyboard('{ArrowRight}');
    const afterNow = live.textContent;
    await user.keyboard('{Home}');
    expect(live.textContent).not.toBe(afterNow);

    const toggle = screen.getByRole('button', { name: 'Show data table' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Hide data table' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    const table = screen.getByRole('table', { name: /by hour/ });
    expect(within(table).getAllByRole('columnheader')).toHaveLength(4);
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(24);
  });
});

describe('command menu', () => {
  it('opens with Ctrl+K, traps focus and closes with Escape', async () => {
    const user = userEvent.setup();
    await mountPage(page('/'));
    const trigger = screen.getByRole('button', { name: 'Open command menu' });
    trigger.focus();

    await user.keyboard('{Control>}k{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Command menu' });
    const input = within(dialog).getByRole('combobox');
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveAccessibleName();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);

    for (let i = 0; i < 4; i++) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    await user.tab({ shift: true });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    // The page behind the dialog is hidden from assistive technology while it is open.
    expect(screen.queryByRole('main')).not.toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('returns focus to the button that opened it', async () => {
    const user = userEvent.setup();
    await mountPage(page('/'));
    const opener = screen.getByRole('button', { name: /^Location: .*Change location$/ });
    await user.click(opener);
    const dialog = await screen.findByRole('dialog', { name: 'Command menu' });
    await waitFor(() => expect(within(dialog).getByRole('combobox')).toHaveFocus());

    // Ctrl+K closes it too, and must not mistake the menu's own input for the opener.
    await user.keyboard('{Control>}k{/Control}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('has no axe violations while open', async () => {
    const user = userEvent.setup();
    await mountPage(page('/'));
    await user.keyboard('{Control>}k{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Command menu' });
    expect(await axeViolations(dialog)).toEqual([]);
  });

  it('opens from the header search button and navigates with arrows and Enter', async () => {
    const user = userEvent.setup();
    await mountPage(page('/'));
    await user.click(screen.getByRole('button', { name: /Search or ask/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Command menu' });
    const input = within(dialog).getByRole('combobox');
    await user.type(input, 'Fo');

    const forecast = within(dialog).getByRole('option', { name: 'Forecast' });
    for (let i = 0; i < 6 && forecast.getAttribute('aria-selected') !== 'true'; i++) {
      await user.keyboard('{ArrowDown}');
    }
    expect(forecast).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', forecast.id);
    expect(input).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { level: 1, name: 'Forecast' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('status updates', () => {
  it('announces deploy progress through polite live regions', async () => {
    const user = userEvent.setup();
    const gate = deferred();
    const answer = api.plan;
    api.plan = async () => {
      await gate.promise;
      return answer();
    };
    await mountPage(page('/routine'));
    const status = screen.getByText('Not deployed');
    expect(status).toHaveAttribute('aria-live', 'polite');

    await user.click(screen.getByRole('button', { name: 'Deploy with Gemini' }));
    await waitFor(() => expect(status).toHaveTextContent('Building'));
    const deploying = screen.getByRole('button', { name: 'Deploying…' });
    expect(deploying).toHaveAttribute('aria-busy', 'true');
    expect(deploying).toBeDisabled();

    // The build log opens by itself and is announced line by line.
    const logToggle = screen.getByRole('button', { name: /Build logs/ });
    expect(logToggle).toHaveAttribute('aria-expanded', 'true');
    expect(logToggle).toHaveAttribute('aria-controls', 'build-logs');
    await waitFor(() =>
      expect(document.querySelector('#build-logs [aria-live="polite"]')).toHaveTextContent(
        /Asking Gemini to explain the plan/,
      ),
    );

    gate.resolve();
    await waitFor(() => expect(status).toHaveTextContent('Ready'));
    expect(screen.getByRole('button', { name: 'Redeploy with Gemini' })).toBeEnabled();
  });

  it('announces a streaming answer through a status region and a conversation log', async () => {
    const user = userEvent.setup();
    const chat = controlledChat();
    api.chat = async () => chat.response;
    await mountPage(page('/assistant'));
    const status = within(screen.getByRole('main')).getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('');
    const log = screen.getByRole('log', { name: 'Conversation' });

    await user.type(screen.getByRole('textbox', { name: 'Ask Exhale' }), 'When should we air?');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(status).toHaveTextContent('Exhale is answering'));
    expect(within(log).getByText('When should we air?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled();

    chat.push('Open the windows ');
    const answer = await within(log).findByText(/Open the windows/);
    expect(answer.closest('li')).toHaveAttribute('aria-busy', 'true');

    chat.push('after 1 pm.');
    chat.close();
    await waitFor(() => expect(status).toHaveTextContent('Answer ready'));
    expect(log).toHaveTextContent('Open the windows after 1 pm.');
    expect(log.querySelector('[aria-busy="true"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Send question' })).toBeInTheDocument();
  });

  it('announces that a stopped answer was stopped', async () => {
    const user = userEvent.setup();
    // Never answers; rejects like fetch does once the request is aborted.
    api.chat = (signal) =>
      new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    await mountPage(page('/assistant'));
    const status = within(screen.getByRole('main')).getByRole('status');
    await user.type(screen.getByRole('textbox', { name: 'Ask Exhale' }), 'Is it safe to run?');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(status).toHaveTextContent('Exhale is answering'));

    await user.click(screen.getByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(status).toHaveTextContent('Stopped'));
    expect(screen.getByRole('button', { name: 'Send question' })).toBeInTheDocument();
  });

  it('announces loading, then the feed state, as statuses', async () => {
    const gate = deferred();
    vi.mocked(fetchAirSnapshot).mockImplementationOnce(async () => {
      await gate.promise;
      return makeSnapshot();
    });
    renderRoute('/');
    const loading = await screen.findByText('Loading live air data');
    expect(loading).toHaveAttribute('role', 'status');
    expect(loading.closest('[aria-busy="true"]')).not.toBeNull();

    gate.resolve();
    await screen.findByText(/air can only mix/);
    expect(screen.queryByText('Loading live air data')).not.toBeInTheDocument();
    const feed = screen.getByText('Live data feeds normal');
    expect(feed).toHaveAttribute('role', 'status');
    expect(screen.getByRole('contentinfo')).toContainElement(feed);
  });
});

describe('with prefers-reduced-motion: reduce', () => {
  beforeEach(() => setReducedMotion(true));

  it.each(PAGES)('$title still renders and passes axe', async (target) => {
    expect(window.matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(true);
    const { container } = await mountPage(target);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(target.title);
    expect(target.primary()).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('opens routine details without animating their height', async () => {
    const user = userEvent.setup();
    await mountPage(page('/routine'));
    const toggle = firstRoutineRow();
    const panelId = toggle.getAttribute('aria-controls')!;
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const panel = document.getElementById(panelId)!;
    expect(panel).toBeInTheDocument();
    expect(panel.style.height).toBe('');
    expect(within(panel).getByText('How we worked it out')).toBeInTheDocument();
  });

  it('still deploys and announces the result', async () => {
    const user = userEvent.setup();
    await mountPage(page('/routine'));
    const status = screen.getByText('Not deployed');
    await user.click(screen.getByRole('button', { name: 'Deploy with Gemini' }));
    await waitFor(() => expect(status).toHaveTextContent('Ready'));
  });
});

describe('without a reduced-motion preference', () => {
  it('animates the height of routine details, so the reduced-motion check is meaningful', async () => {
    const user = userEvent.setup();
    await mountPage(page('/routine'));
    const toggle = firstRoutineRow();
    await user.click(toggle);
    const panel = document.getElementById(toggle.getAttribute('aria-controls')!)!;
    expect(panel.style.height).not.toBe('');
  });
});
