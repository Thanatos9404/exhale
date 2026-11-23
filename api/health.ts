import { getClient, modelChain } from '../server/gemini.js';
import { json } from '../server/http.js';

/** GET /api/health: lets the UI show whether Gemini is connected, without exposing secrets. */
export function GET(): Response {
  const ai = getClient() !== null;
  return json({ ok: true, ai, model: ai ? modelChain()[0] : null });
}
