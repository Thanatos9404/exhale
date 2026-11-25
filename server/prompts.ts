/**
 * Prompt construction for the server's providers. The guardrails and the CONTEXT builders live in
 * src/lib/prompts, so the browser's on-device path (Gemini Nano through Firebase AI Logic) sends
 * the same tagged data blocks and the same rules. This module re-exports them under the names the
 * server has always used.
 */
export {
  CHAT_SYSTEM,
  DATA_TAGS,
  PLAN_SYSTEM,
  asData,
  neutralise,
  type DataTag,
} from '../src/lib/prompts/guardrails.js';
export {
  buildChatContext,
  buildPlanPrompt,
  describeHousehold,
  describePlan,
} from '../src/lib/prompts/context.js';
