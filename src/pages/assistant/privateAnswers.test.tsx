import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as OpenMeteo from '@/lib/air/openMeteo';
import { DEFAULT_HOUSEHOLD } from '@/lib/profile/schema';
import { KEYS } from '@/lib/storage';
import { makeSnapshot } from '@/test/fixtures';
import { axeViolations, renderApp } from '@/test/render';
import Assistant from '../Assistant';
import { PLAN_NOT_READY, answerQuestion } from './answer';
import { parseChat } from './chat';

/**
 * The Assistant with Firebase configured: the same private-answers choice as the Routine page,
 * answered by a fake hybrid client. A private question never reaches /api/chat.
 */

const fake = vi.hoisted(() => ({
  prepareOnDevice: vi.fn(async (_progress?: (fraction: number) => void) => {}),
  explainPlanOnDevice: vi.fn(),
  askOnDevice: vi.fn(),
}));
vi.mock('@/services/firebase', () => ({ privateAi: fake }));

vi.mock('@/lib/air/openMeteo', async (orig) => {
  const actual = await orig<typeof OpenMeteo>();
  return {
    ...actual,
    fetchAirSnapshot: vi.fn(async () => makeSnapshot()),
    searchPlaces: vi.fn(async () => []),
  };
});

window.scrollTo = () => {};

const LABEL = 'Answer on this device (Gemini Nano)';
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
/** The address a fetch was made to, whatever form it was given in. */
function urlOf(input: RequestInfo | URL): string {
  if (input instanceof Request) return input.url;
  return input instanceof URL ? input.href : input;
}
const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = urlOf(input);
  return url.includes('/api/chat')
    ? new Response('From the server.')
    : json({ ok: true, ai: true, model: null });
});
const chatCalls = () =>
  fetchMock.mock.calls.filter(([input]) => urlOf(input).includes('/api/chat')).length;

/** Streams `text` in two chunks from `engine`, as the hybrid client reports it. */
function answerWith(text: string, engine: 'on-device' | 'cloud') {
  fake.askOnDevice.mockImplementation(async (_q, _plan, _household, options) => {
    const half = Math.ceil(text.length / 2);
    options?.onText?.(text.slice(0, half), engine);
    options?.onText?.(text, engine);
    return { text, engine };
  });
}

async function ask(question: string) {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('switch', { name: LABEL }));
  await user.type(screen.getByRole('textbox', { name: 'Ask Exhale' }), `${question}{Enter}`);
  return user;
}

beforeEach(() => vi.stubGlobal('fetch', fetchMock));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('Private answers in the Assistant', () => {
  it('offers the switch beside web search, described by the privacy note', async () => {
    const { container } = renderApp(<Assistant />);
    const toggle = await screen.findByRole('switch', { name: LABEL });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toHaveAccessibleDescription(/Health details stay in this browser/);
    expect(screen.getByRole('switch', { name: /Search the web/ })).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('answers on this device, never calls the server, and badges the answer', async () => {
    answerWith('Keep Kid indoors until 11:00.', 'on-device');
    const { container } = renderApp(<Assistant />);
    await ask('When can Kid go out?');

    expect(await screen.findByText('Keep Kid indoors until 11:00.')).toBeInTheDocument();
    expect(screen.getByText('On-device')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Answer ready, written by Gemini Nano on this device',
    );
    const [question, plan, household] = fake.askOnDevice.mock.calls[0]!;
    expect(question).toBe('When can Kid go out?');
    expect(plan.items.length).toBeGreaterThan(0);
    expect(household).toEqual(DEFAULT_HOUSEHOLD);
    expect(chatCalls()).toBe(0);
    // Private answers cannot search the web, so that switch steps aside.
    expect(screen.queryByRole('switch', { name: /Search the web/ })).not.toBeInTheDocument();
    // The badge survives a reload: the engine is stored with the answer.
    const stored = parseChat(JSON.parse(localStorage.getItem(KEYS.chat) ?? 'null'));
    expect(stored?.at(-1)).toEqual({
      role: 'model',
      text: 'Keep Kid indoors until 11:00.',
      engine: 'on-device',
    });
    expect(await axeViolations(container)).toEqual([]);
  });

  it('badges a cloud fallback as Cloud (Firebase)', async () => {
    answerWith('From Firebase in the cloud.', 'cloud');
    renderApp(<Assistant />);
    await ask('Is the metro better today?');
    expect(await screen.findByText('Cloud (Firebase)')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'written by cloud Gemini through Firebase',
    );
  });

  it('restores the question when the private model fails', async () => {
    fake.askOnDevice.mockRejectedValue(new Error('Firebase is unreachable'));
    renderApp(<Assistant />);
    await ask('Should we air the flat?');
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Ask Exhale' })).toHaveValue(
        'Should we air the flat?',
      ),
    );
    expect(chatCalls()).toBe(0);
  });

  it('still uses the server when the switch is off', async () => {
    const user = userEvent.setup();
    renderApp(<Assistant />);
    await screen.findByRole('switch', { name: LABEL });
    await user.type(screen.getByRole('textbox', { name: 'Ask Exhale' }), 'Hello{Enter}');
    expect(await screen.findByText('From the server.')).toBeInTheDocument();
    expect(fake.askOnDevice).not.toHaveBeenCalled();
    expect(screen.queryByText('On-device')).not.toBeInTheDocument();
  });
});

describe('answerQuestion', () => {
  const question = {
    text: 'Hi',
    history: [{ role: 'user' as const, text: 'Hi' }],
    place: makeSnapshot().place,
    household: DEFAULT_HOUSEHOLD,
    search: false,
  };

  it('refuses a private question before the plan exists, without calling any model', async () => {
    const route = { client: fake, plan: null, whenPrepared: async () => {} };
    await expect(
      answerQuestion(question, route, () => {}, new AbortController().signal),
    ).rejects.toThrow(PLAN_NOT_READY);
    expect(fake.askOnDevice).not.toHaveBeenCalled();
  });
});
