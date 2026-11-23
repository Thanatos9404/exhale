import type { Content } from '@google/genai';
import { getAir } from '../server/airCache.js';
import { claudeStream, getClaude, type ChatTurn } from '../server/claude.js';
import { fallbackAnswer } from '../server/fallback.js';
import { getClient, streamText } from '../server/gemini.js';
import { HttpError, SECURITY_HEADERS, clientKey, errorResponse, readJson } from '../server/http.js';
import { CHAT_SYSTEM, buildChatContext } from '../server/prompts.js';
import { createRateLimiter } from '../server/rateLimit.js';
import { chatRequestSchema, type ChatRequest } from '../server/schemas.js';
import { buildPlan, type PlanResult } from '../src/lib/planner/engine.js';
import { parseHousehold, type Household } from '../src/lib/profile/schema.js';

/** 30 questions per 5 minutes per client: a real conversation fits, scripted abuse does not. */
const limiter = createRateLimiter({ limit: 30, windowMs: 5 * 60_000 });

/** Sixteen 2,000-character messages plus a household profile fit inside this with headroom. */
const MAX_BODY_BYTES = 48_000;

const SEARCH_UNAVAILABLE =
  '_Web search is unavailable right now, so this answer uses your live data only._\n\n';

type ChatMessages = ChatRequest['messages'];

/** Validates the body. The last message must be the user's question. */
async function readChatRequest(request: Request) {
  const body = chatRequestSchema.safeParse(await readJson(request, MAX_BODY_BYTES));
  if (!body.success) throw new HttpError(400, 'Invalid chat request');
  const household = parseHousehold(body.data.household);
  if (!household) throw new HttpError(400, 'Invalid household profile');
  const last = body.data.messages.at(-1);
  if (last?.role !== 'user') throw new HttpError(400, 'Last message must be from the user');
  return { ...body.data, household, question: last.text };
}

/** The plan goes first as context; user text is wrapped in <user> tags so it stays data. */
function toContents(plan: PlanResult, household: Household, messages: ChatMessages): Content[] {
  return [
    { role: 'user', parts: [{ text: buildChatContext(plan, household) }] },
    { role: 'model', parts: [{ text: 'Understood. I will use only this context for numbers.' }] },
    ...messages.map((m) => ({
      role: m.role,
      parts: [{ text: m.role === 'user' ? `<user>${m.text}</user>` : m.text }],
    })),
  ];
}

/** The same conversation in Anthropic's message format. */
function toClaudeTurns(contents: Content[]): ChatTurn[] {
  return contents.map((c) => ({
    role: c.role === 'model' ? 'assistant' : 'user',
    content: (c.parts ?? []).map((p) => p.text ?? '').join(''),
  }));
}

/** Writes every chunk and reports whether anything was written. */
async function pipe(source: AsyncIterable<string>, write: (text: string) => void) {
  let sent = false;
  for await (const chunk of source) {
    sent = true;
    write(chunk);
  }
  return sent;
}

interface Answer {
  contents: Content[];
  search: boolean;
  question: string;
  plan: PlanResult;
  useGemini: boolean;
  useClaude: boolean;
}

/**
 * The first provider that writes anything wins: Gemini (with search, then without), then Claude
 * Haiku, then the offline engine, so the user always gets an answer.
 */
function answerStream(a: Answer): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (text: string) => controller.enqueue(encoder.encode(text));
      const gemini = (search: boolean) =>
        pipe(streamText({ system: CHAT_SYSTEM, contents: a.contents, search }), write);
      let sent = false;
      if (a.useGemini) {
        sent = await gemini(a.search);
        if (!sent && a.search) {
          // Grounding can be unavailable (quota or region); answer from live data instead of failing.
          write(SEARCH_UNAVAILABLE);
          sent = await gemini(false);
        }
      }
      if (!sent && a.useClaude) {
        // Gemini exhausted every key and model: Claude Haiku answers from the same grounded context.
        const messages = toClaudeTurns(a.contents);
        sent = await pipe(claudeStream({ system: CHAT_SYSTEM, messages }), write);
      }
      if (!sent) write(fallbackAnswer(a.question, a.plan, a.useGemini || a.useClaude));
      controller.close();
    },
  });
}

/**
 * POST /api/chat
 * Body: { place, household, messages: [{ role: 'user' | 'model', text }], search? }
 * Streams a plain-text (Markdown) answer grounded in the family's live air data and plan.
 * Optional Google Search grounding pulls in current local advisories, with sources listed.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const rl = limiter.check(clientKey(request));
    if (!rl.ok)
      throw new HttpError(429, 'Too many questions at once. Try again shortly.', {
        'retry-after': String(rl.retryAfterSec),
      });

    const { household, messages, place, search, question } = await readChatRequest(request);
    const air = await getAir(place).catch(() => {
      throw new HttpError(502, 'Air data provider is unavailable');
    });
    const plan = buildPlan(household, air);
    const useGemini = getClient() !== null;
    const useClaude = getClaude() !== null;
    const contents = toContents(plan, household, messages);
    const stream = answerStream({ contents, search, question, plan, useGemini, useClaude });

    return new Response(stream, {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'x-exhale-source': useGemini ? 'gemini' : useClaude ? 'claude' : 'rules',
        'x-ratelimit-remaining': String(rl.remaining),
        ...SECURITY_HEADERS,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** GET is not supported; answers 405 with an Allow header. */
export function GET(): Response {
  return new Response(JSON.stringify({ error: 'Use POST' }), {
    status: 405,
    headers: { 'content-type': 'application/json', allow: 'POST', ...SECURITY_HEADERS },
  });
}
