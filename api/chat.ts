import type { Content } from '@google/genai';
import { getAir } from '../server/airCache.js';
import { claudeStream, getClaude, type ChatTurn } from '../server/claude.js';
import { fallbackAnswer } from '../server/fallback.js';
import { getClient, streamText } from '../server/gemini.js';
import { HttpError, SECURITY_HEADERS, clientKey, errorResponse, readJson } from '../server/http.js';
import { CHAT_SYSTEM, buildChatContext } from '../server/prompts.js';
import { createRateLimiter } from '../server/rateLimit.js';
import { chatRequestSchema } from '../server/schemas.js';
import { buildPlan } from '../src/lib/planner/engine.js';
import { parseHousehold } from '../src/lib/profile/schema.js';

/**
 * POST /api/chat
 * Body: { place, household, messages: [{ role: 'user' | 'model', text }], search? }
 * Streams a plain-text (Markdown) answer grounded in the family's live air data and plan.
 * Optional Google Search grounding pulls in current local advisories, with sources listed.
 */

const limiter = createRateLimiter({ limit: 30, windowMs: 5 * 60_000 });

export async function POST(request: Request): Promise<Response> {
  try {
    const rl = limiter.check(clientKey(request));
    if (!rl.ok)
      throw new HttpError(429, 'Too many questions at once. Try again shortly.', {
        'retry-after': String(rl.retryAfterSec),
      });

    const body = chatRequestSchema.safeParse(await readJson(request, 48_000));
    if (!body.success) throw new HttpError(400, 'Invalid chat request');
    const household = parseHousehold(body.data.household);
    if (!household) throw new HttpError(400, 'Invalid household profile');
    const { messages, place, search } = body.data;
    if (messages[messages.length - 1]!.role !== 'user')
      throw new HttpError(400, 'Last message must be from the user');

    const air = await getAir(place).catch(() => {
      throw new HttpError(502, 'Air data provider is unavailable');
    });
    const plan = buildPlan(household, air);

    const contents: Content[] = [
      { role: 'user', parts: [{ text: buildChatContext(plan, household) }] },
      { role: 'model', parts: [{ text: 'Understood. I will use only this context for numbers.' }] },
      ...messages.map((m) => ({
        role: m.role,
        parts: [{ text: m.role === 'user' ? `<user>${m.text}</user>` : m.text }],
      })),
    ];

    const encoder = new TextEncoder();
    const question = messages[messages.length - 1]!.text;
    const useGemini = getClient() !== null;
    const useClaude = getClaude() !== null;
    const useAi = useGemini || useClaude;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let sent = false;
        const pipe = async (withSearch: boolean) => {
          for await (const chunk of streamText({
            system: CHAT_SYSTEM,
            contents,
            search: withSearch,
          })) {
            sent = true;
            controller.enqueue(encoder.encode(chunk));
          }
        };
        if (useGemini) {
          await pipe(search);
          if (!sent && search) {
            // Grounding can be unavailable (quota or region); answer from live data instead of failing.
            controller.enqueue(
              encoder.encode(
                '_Web search is unavailable right now, so this answer uses your live data only._\n\n',
              ),
            );
            await pipe(false);
          }
        }
        if (!sent && useClaude) {
          // Gemini exhausted every key and model: Claude Haiku answers from the same grounded context.
          const turns: ChatTurn[] = contents.map((c) => ({
            role: c.role === 'model' ? 'assistant' : 'user',
            content: (c.parts ?? []).map((p) => p.text ?? '').join(''),
          }));
          for await (const chunk of claudeStream({ system: CHAT_SYSTEM, messages: turns })) {
            sent = true;
            controller.enqueue(encoder.encode(chunk));
          }
        }
        if (!sent) controller.enqueue(encoder.encode(fallbackAnswer(question, plan, useAi)));
        controller.close();
      },
    });

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

export function GET(): Response {
  return new Response(JSON.stringify({ error: 'Use POST' }), {
    status: 405,
    headers: { 'content-type': 'application/json', allow: 'POST', ...SECURITY_HEADERS },
  });
}
