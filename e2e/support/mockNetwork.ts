/**
 * The route mocker that keeps the suite hermetic.
 *
 * One handler sees every request the page makes. Open-Meteo, BigDataCloud and the app's own
 * `/api/*` functions are answered from fixtures; the preview server's static files pass through;
 * anything else is aborted and recorded in `escaped`, which the test fixture asserts is empty.
 * Tests change the public fields and call the helpers to stage outages and slow responses.
 */
import type { Page, Route } from '@playwright/test';
import type { PlanResponse } from '@/lib/apiTypes';
import {
  CHAT_ANSWER,
  HEALTH,
  OPEN_METEO,
  REVERSE_GEOCODE,
  geocodeResponse,
  planResponse,
} from './fixtures';

/** A failed API reply: the status and the `{ error }` message the server would send. */
export interface ApiFailure {
  status: number;
  error: string;
}

type Handler = (route: Route, url: URL) => Promise<void>;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const CORS = { 'access-control-allow-origin': '*' };

function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: CORS,
    body: JSON.stringify(body),
  });
}

export class MockNetwork {
  /** Requests that tried to leave the machine without a mock. Must stay empty. */
  readonly escaped: string[] = [];
  /** How many times each mocked endpoint was called. */
  readonly calls = { air: 0, weather: 0, geocode: 0, reverse: 0, plan: 0, chat: 0, health: 0 };
  /** Bodies posted to `/api/chat`, in order. */
  readonly chatRequests: unknown[] = [];

  /** HTTP status of the Open-Meteo air-quality feed; anything but 200 is an outage. */
  airStatus = 200;
  /** HTTP status of the Open-Meteo weather feed. */
  weatherStatus = 200;
  /** Which provider `/api/plan` says wrote the plan, or the failure it returns. */
  plan: PlanResponse['source'] | ApiFailure = 'gemini';
  /** The text `/api/chat` streams back, or the failure it returns. */
  chat: string | ApiFailure = CHAT_ANSWER;

  private planGate: Promise<void> = Promise.resolve();
  private openPlanGate: () => void = () => undefined;

  private readonly remote: Record<string, Handler> = {
    'air-quality-api.open-meteo.com': (route) => {
      this.calls.air += 1;
      return this.feed(route, this.airStatus, OPEN_METEO.air);
    },
    'api.open-meteo.com': (route) => {
      this.calls.weather += 1;
      return this.feed(route, this.weatherStatus, OPEN_METEO.weather);
    },
    'geocoding-api.open-meteo.com': (route, url) => {
      this.calls.geocode += 1;
      return json(route, 200, geocodeResponse(url.searchParams.get('name') ?? ''));
    },
    'api.bigdatacloud.net': (route) => {
      this.calls.reverse += 1;
      return json(route, 200, REVERSE_GEOCODE);
    },
  };

  private readonly api: Record<string, Handler> = {
    '/api/health': (route) => {
      this.calls.health += 1;
      return json(route, 200, HEALTH);
    },
    '/api/plan': (route) => this.answerPlan(route),
    '/api/chat': (route) => this.answerChat(route),
  };

  /** Starts intercepting every request the page makes. Call before the first navigation. */
  async install(page: Page): Promise<void> {
    await page.route('**/*', (route) => this.dispatch(route));
  }

  /** Makes `/api/plan` wait. The returned function lets the held response through. */
  holdPlan(): () => void {
    this.planGate = new Promise<void>((resolve) => {
      this.openPlanGate = resolve;
    });
    return () => this.openPlanGate();
  }

  /** Lets any held response through; safe to call when nothing is held. */
  release(): void {
    this.openPlanGate();
  }

  private dispatch(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    if (LOCAL_HOSTS.has(url.hostname)) {
      if (!url.pathname.startsWith('/api/')) return route.continue();
      const handler = this.api[url.pathname];
      return handler ? handler(route, url) : json(route, 404, { error: 'No such fixture route' });
    }
    const handler = this.remote[url.hostname];
    if (handler) return handler(route, url);
    this.escaped.push(`${request.method()} ${request.url()}`);
    return route.abort('blockedbyclient');
  }

  private feed(route: Route, status: number, body: unknown): Promise<void> {
    if (status === 200) return json(route, 200, body);
    return json(route, status, { error: true, reason: 'Fixture outage' });
  }

  private async answerPlan(route: Route): Promise<void> {
    this.calls.plan += 1;
    const posted: unknown = route.request().postDataJSON();
    await this.planGate;
    const { plan } = this;
    if (typeof plan !== 'string') return json(route, plan.status, { error: plan.error });
    return json(route, 200, planResponse(plan, posted));
  }

  private answerChat(route: Route): Promise<void> {
    this.calls.chat += 1;
    const posted: unknown = route.request().postDataJSON();
    this.chatRequests.push(posted);
    const { chat } = this;
    if (typeof chat !== 'string') return json(route, chat.status, { error: chat.error });
    return route.fulfill({
      status: 200,
      contentType: 'text/plain; charset=utf-8',
      headers: { 'x-exhale-source': 'gemini', 'cache-control': 'no-store' },
      body: chat,
    });
  }
}
