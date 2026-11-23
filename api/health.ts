import { getClaude, CLAUDE_MODEL } from '../server/claude.js';
import { getClient, keyCount, modelChain } from '../server/gemini.js';
import { json } from '../server/http.js';

/** GET /api/health: which AI providers are configured, without exposing secrets. */
export function GET(): Response {
  const gemini = getClient() !== null;
  const claude = getClaude() !== null;
  const providers = [...(gemini ? ['gemini'] : []), ...(claude ? ['claude'] : [])];
  return json({
    ok: true,
    ai: providers.length > 0,
    model: gemini ? modelChain()[0] : claude ? CLAUDE_MODEL : null,
    providers,
    geminiKeys: keyCount(),
  });
}
