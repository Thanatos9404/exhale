/**
 * POST /api/plan
 * Body: { place: { lat, lon, label }, household }
 * Fetches live air data server-side, runs the deterministic planner, then asks the AI providers
 * to explain the plan and add tailored indoor hacks and sustainable swaps. Without a key, on
 * failure or when the request deadline runs out, it returns the engine's plan alone so the app
 * keeps working.
 */
import { CLAUDE_MODEL } from '../server/claude.js';
import { startDeadline } from '../server/deadline.js';
import type { JsonResult } from '../server/gemini.js';
import { HttpError, errorResponse, json, methodNotAllowed, readJson } from '../server/http.js';
import { explainPlan } from '../server/planAi.js';
import { createRateLimiter } from '../server/rateLimit.js';
import { admit, liveAir } from '../server/request.js';
import { planRequestSchema, type AiPlan } from '../server/schemas.js';
import { buildPlan, type PlanResult } from '../src/lib/planner/engine.js';
import type { PlanResponse } from '../src/lib/apiTypes.js';
import { parseHousehold } from '../src/lib/profile/schema.js';

/** 12 plans per 5 minutes per client: each plan can fan out to several AI calls. */
const limiter = createRateLimiter({ limit: 12, windowMs: 5 * 60_000 });

/** A place plus a household profile (about 3 kB at its largest) fits well inside this. */
const MAX_BODY_BYTES = 24_000;

const TOO_MANY = 'Too many plans requested. Try again shortly.';

/** Keeps only explanations for items the engine produced, in engine order. */
function mergeAi(plan: PlanResult, ai: AiPlan): AiPlan {
  const ids = new Set(plan.items.map((i) => i.id));
  return { ...ai, items: ai.items.filter((i) => ids.has(i.id)) };
}

/** Who wrote the wording: the engine's rules when no provider answered. */
function sourceOf(ai: JsonResult<AiPlan> | null): PlanResponse['source'] {
  if (!ai) return 'rules';
  return ai.model === CLAUDE_MODEL ? 'claude' : 'gemini';
}

/** Answers a plan request. One deadline, started here, bounds every stage that follows. */
export async function POST(request: Request): Promise<Response> {
  const deadline = startDeadline();
  try {
    const rl = admit(request, limiter, TOO_MANY);
    const body = planRequestSchema.safeParse(await readJson(request, MAX_BODY_BYTES));
    if (!body.success) throw new HttpError(400, 'Invalid plan request');
    const household = parseHousehold(body.data.household);
    if (!household) throw new HttpError(400, 'Invalid household profile');

    const plan = buildPlan(household, await liveAir(body.data.place, deadline));
    // A cached answer, then Gemini, then Claude Haiku, then the engine's own words.
    const ai = await explainPlan(plan, household, deadline);

    const response: PlanResponse = {
      plan,
      ai: ai ? mergeAi(plan, ai.data) : null,
      source: sourceOf(ai),
      model: ai?.model ?? null,
    };
    return json(response, 200, { 'x-ratelimit-remaining': String(rl.remaining) });
  } catch (err) {
    return errorResponse(err);
  }
}

const notAllowed = methodNotAllowed('POST');

/** Every other method answers 405 with an Allow header. */
export { notAllowed as GET, notAllowed as PUT, notAllowed as PATCH, notAllowed as DELETE };
