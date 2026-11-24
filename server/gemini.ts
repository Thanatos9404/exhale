/**
 * Thin wrapper over the Gemini API (Google AI Studio keys). This file is the public entry point;
 * the parts live in ./gemini/.
 * - Keys are read from the server environment only; they are never sent to the browser.
 * - Several keys can be configured (GEMINI_API_KEYS, comma separated). Every key × model pair is
 *   a candidate, so one exhausted key or overloaded model never takes the feature down
 *   (./gemini/candidates.ts).
 * - A pair that fails is skipped for a few minutes (circuit breaker); quota errors for longer
 *   (./gemini/breaker.ts).
 * - Every call has a per-attempt timeout and an overall deadline that fits a serverless function
 *   (./gemini/config.ts).
 * - Every structured response is validated with zod before the app trusts it (./gemini/json.ts).
 */

export { outOfQuota } from './gemini/breaker.js';
export {
  DEFAULT_MODELS,
  candidates,
  configuredKeys,
  getClient,
  keyCount,
  modelChain,
  setClient,
  type Candidate,
  type GenAiLike,
} from './gemini/candidates.js';
export { isRetryable } from './gemini/errors.js';
export { hedged } from './gemini/hedged.js';
export { generateJson, type JsonResult } from './gemini/json.js';
export { streamText, type ChatContent, type StreamOptions } from './gemini/stream.js';
