/**
 * POST /api/chat
 * Body: { place, household, messages: [{ role: 'user' | 'model', text }], search? }
 * Streams a plain-text (Markdown) answer grounded in the family's live air data and plan.
 * Optional Google Search grounding pulls in current local advisories, with sources listed.
 * The x-exhale-source header names the provider that wrote the answer.
 */
import { answerChat, type ChatChunk } from '../server/chatAnswer.js';
import { chatContents } from '../server/chatPrompt.js';
import { startDeadline } from '../server/deadline.js';
import {
  HttpError,
  SECURITY_HEADERS,
  clientKey,
  errorResponse,
  methodNotAllowed,
  readJson,
} from '../server/http.js';
import * as log from '../server/log.js';
import { createRateLimiter } from '../server/rateLimit.js';
import { admit, enforceLimit, liveAir } from '../server/request.js';
import { MAX_CHAT_MESSAGES, MAX_MODEL_TURN_CHARS, chatRequestSchema } from '../server/schemas.js';
import { buildPlan } from '../src/lib/planner/engine.js';
import { parseHousehold } from '../src/lib/profile/schema.js';

/** Both chat limits count over the same five minutes. */
const LIMIT_WINDOW_MS = 5 * 60_000;

/** 30 questions per 5 minutes per client: a real conversation fits, scripted abuse does not. */
const limiter = createRateLimiter({ limit: 30, windowMs: LIMIT_WINDOW_MS });

/**
 * 6 web-search questions per 5 minutes per client. A grounded call is billed per search on top of
 * its tokens and has a far smaller quota, so it gets a fifth of the plain allowance: enough to
 * check today's advisories, not enough to drain the search quota for everyone else.
 */
const searchLimiter = createRateLimiter({ limit: 6, windowMs: LIMIT_WINDOW_MS });

/** UTF-8 needs at most 3 bytes for one UTF-16 unit, which is what the schema's lengths count. */
const MAX_BYTES_PER_CHAR = 3;

/** Room for the place, a full household profile (about 3 kB) and the JSON around every message. */
const ENVELOPE_BYTES = 16_000;

/**
 * The largest body the schema accepts must fit: sixteen turns at the model-turn length, in a
 * script that needs three bytes per character (Devanagari answers are normal here), plus the
 * envelope. A smaller cap would reject valid conversations with a 413.
 */
const MAX_BODY_BYTES =
  MAX_CHAT_MESSAGES * MAX_MODEL_TURN_CHARS * MAX_BYTES_PER_CHAR + ENVELOPE_BYTES;

const TOO_MANY = 'Too many questions at once. Try again shortly.';
const TOO_MANY_SEARCHES = 'Too many web-search questions. Turn search off or try again shortly.';
const CUT_SHORT = '\n\n_The answer was cut short. Please ask again._';

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

/**
 * The response body: the first chunk, then the rest of the answer as it arrives. Nothing in here
 * can become an unhandled rejection. A reader that leaves closes the controller, which makes the
 * next write throw: that is caught and ignored, and `cancel` aborts the provider call. Any other
 * failure is logged and the answer ends with a short note.
 */
function toStream(
  first: ChatChunk,
  rest: AsyncGenerator<ChatChunk, void>,
  abort: AbortController,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (text: string) => controller.enqueue(encoder.encode(text));
      try {
        write(first.text);
        for await (const chunk of rest) write(chunk.text);
        controller.close();
      } catch (err) {
        if (abort.signal.aborted) return;
        log.warn('chat stream failed:', log.errorMessage(err, 160));
        abort.abort();
        try {
          write(CUT_SHORT);
          controller.close();
        } catch {
          // The stream is already closed or errored; there is no one left to tell.
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });
}

/** Answers a chat question. One deadline, started here, bounds every stage that follows. */
export async function POST(request: Request): Promise<Response> {
  const deadline = startDeadline();
  try {
    const rl = admit(request, limiter, TOO_MANY);
    const chat = await readChatRequest(request);
    if (chat.search) enforceLimit(searchLimiter, clientKey(request), TOO_MANY_SEARCHES);
    const plan = buildPlan(chat.household, await liveAir(chat.place, deadline));

    const abort = new AbortController();
    // A client that disconnects before the answer starts stops the provider calls as well.
    request.signal.addEventListener('abort', () => abort.abort(), { once: true });
    const chunks = answerChat({
      contents: chatContents(plan, chat.household, chat.messages),
      search: chat.search,
      question: chat.question,
      plan,
      deadline,
      signal: abort.signal,
    });
    // Waiting for the first chunk makes the source header true: it names the provider that
    // answered, not the one that was expected to. The chain yields nothing only if the client left.
    const opening = await chunks.next();
    const first: ChatChunk = opening.done ? { source: 'rules', text: '' } : opening.value;

    return new Response(toStream(first, chunks, abort), {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'x-exhale-source': first.source,
        'x-ratelimit-remaining': String(rl.remaining),
        ...SECURITY_HEADERS,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

const notAllowed = methodNotAllowed('POST');

/** Every other method answers 405 with an Allow header. */
export { notAllowed as GET, notAllowed as PUT, notAllowed as PATCH, notAllowed as DELETE };
