/**
 * GET /api/health: whether the server is up and which AI providers are configured, without
 * exposing secrets or how many keys there are.
 */
import { getClaude, CLAUDE_MODEL } from '../server/claude.js';
import { getClient, modelChain } from '../server/gemini.js';
import { json, methodNotAllowed } from '../server/http.js';

/**
 * The answer is the same for every visitor and changes only with a deploy, so the CDN may serve
 * it for 5 minutes and keep serving it for 10 more while it refreshes in the background. Health
 * checks then stop waking a function on every page load.
 */
const HEALTH_CACHE = 'public, s-maxage=300, stale-while-revalidate=600';

/** The model that answers first: Gemini's primary when configured, otherwise Claude's. */
function primaryModel(gemini: boolean, claude: boolean): string | null | undefined {
  if (gemini) return modelChain()[0];
  return claude ? CLAUDE_MODEL : null;
}

/** Reports the configured providers in fallback order and the model that answers first. */
export function GET(): Response {
  const gemini = getClient() !== null;
  const claude = getClaude() !== null;
  const providers = [...(gemini ? ['gemini'] : []), ...(claude ? ['claude'] : [])];
  return json(
    { ok: true, ai: providers.length > 0, model: primaryModel(gemini, claude), providers },
    200,
    { 'cache-control': HEALTH_CACHE },
  );
}

const notAllowed = methodNotAllowed('GET');

/** Every other method answers 405 with an Allow header. */
export { notAllowed as POST, notAllowed as PUT, notAllowed as PATCH, notAllowed as DELETE };
