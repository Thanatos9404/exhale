/**
 * The hybrid models, built as the Firebase AI Logic hybrid guide documents: `getAI` with the
 * Gemini Developer API backend, then `getGenerativeModel` with `InferenceMode.PREFER_ON_DEVICE`.
 * Gemini Nano answers inside Chrome when it is available; otherwise the SDK falls back to cloud
 * Gemini through Firebase on its own. Each model gets the same system prompt in both places it
 * can run (`inCloudParams.systemInstruction` and an on-device `system` initial prompt), and the
 * explanations model gets its JSON schema in both (`responseSchema` and `responseConstraint`).
 */
import type { FirebaseApp } from 'firebase/app';
import type { GenerativeModel, HybridParams, InferenceMode } from 'firebase/ai';
import { PLAN_EXPLANATIONS_JSON_SCHEMA, type JsonSchema } from '@/lib/prompts/jsonSchema';
import { ASK_SYSTEM, EXPLAIN_SYSTEM } from '@/lib/prompts/onDevice';

/** The two hybrid models: explanations as JSON, and short streamed answers. */
export interface HybridModels {
  explain: GenerativeModel;
  ask: GenerativeModel;
}

/** What one model is for: its system prompt, its output cap and, for JSON, its schema. */
interface ModelSpec {
  system: string;
  /** Cloud output cap in tokens. Gemini Nano has its own, smaller window (9,216 tokens). */
  maxOutputTokens: number;
  jsonSchema?: JsonSchema;
}

/** One "why" per action, under 280 characters each: about 1,500 tokens for a full plan. */
const EXPLAIN: ModelSpec = {
  system: EXPLAIN_SYSTEM,
  maxOutputTokens: 2_048,
  jsonSchema: PLAN_EXPLANATIONS_JSON_SCHEMA,
};
/** An answer is asked to stay under 120 words, which is about 200 tokens. */
const ASK: ModelSpec = { system: ASK_SYSTEM, maxOutputTokens: 512 };

/** English text in and out: the only input and output these features send. */
const ENGLISH_TEXT = [{ type: 'text' as const, languages: ['en'] }];

/** The documented hybrid parameters for one model spec. */
export function hybridParams(
  mode: InferenceMode,
  cloudModel: string,
  spec: ModelSpec,
): HybridParams {
  const json = spec.jsonSchema;
  return {
    mode,
    inCloudParams: {
      model: cloudModel,
      systemInstruction: spec.system,
      generationConfig: {
        maxOutputTokens: spec.maxOutputTokens,
        ...(json ? { responseMimeType: 'application/json', responseSchema: json } : {}),
      },
    },
    onDeviceParams: {
      createOptions: {
        expectedInputs: ENGLISH_TEXT,
        expectedOutputs: ENGLISH_TEXT,
        initialPrompts: [{ role: 'system', content: [{ type: 'text', value: spec.system }] }],
      },
      ...(json ? { promptOptions: { responseConstraint: json } } : {}),
    },
  };
}

/** Builds both hybrid models on a started Firebase app. Loads `firebase/ai` on demand. */
export async function createHybridModels(
  app: FirebaseApp,
  cloudModel: string,
): Promise<HybridModels> {
  const { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } = await import('firebase/ai');
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const mode = InferenceMode.PREFER_ON_DEVICE;
  return {
    explain: getGenerativeModel(ai, hybridParams(mode, cloudModel, EXPLAIN)),
    ask: getGenerativeModel(ai, hybridParams(mode, cloudModel, ASK)),
  };
}
