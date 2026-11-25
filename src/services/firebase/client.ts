/**
 * The private AI client: explanations for today's plan and short answers about it, written by
 * Gemini Nano inside this browser when it is available, or by cloud Gemini through Firebase AI
 * Logic when it is not. Every result says which engine wrote it. Explanations are validated with
 * the server's zod schema and keyed by the engine's action ids; numbers stay with the engine.
 * Firebase, App Check and the models start on the first call and are reused afterwards.
 */
import type { InferenceSource } from 'firebase/ai';
import type { AiEngine } from '@/lib/apiTypes';
import type { PlanResult } from '@/lib/planner/engine';
import type { Household } from '@/lib/profile/schema';
import { buildAskPrompt, buildExplainPrompt, parseExplanations } from '@/lib/prompts/onDevice';
import { startFirebase } from './app';
import type { FirebaseSettings } from './config';
import { createHybridModels, type HybridModels } from './model';

/** How long a request waits for Gemini Nano to download before Firebase answers from the cloud. */
export const PREPARE_WAIT_MS = 15_000;

/** Validated explanations by action id, and the engine that wrote them. */
export interface PrivateExplanations {
  why: Map<string, string>;
  engine: AiEngine;
}

/** A finished answer and the engine that wrote it. */
export interface PrivateAnswer {
  text: string;
  engine: AiEngine;
}

/** Streaming and cancellation for one question. */
export interface AskOptions {
  /** Called with the whole answer so far each time a chunk arrives. */
  onText?: (text: string, engine: AiEngine) => void;
  signal?: AbortSignal;
}

/** The three calls the UI makes. */
export interface PrivateAi {
  /**
   * Starts Firebase and asks Chrome to get Gemini Nano ready, reporting download progress from 0
   * to 1. Call it from a click: Chrome only starts a model download after a user gesture.
   */
  prepareOnDevice: (onProgress?: (fraction: number) => void) => Promise<void>;
  explainPlanOnDevice: (
    plan: PlanResult,
    household: Household,
    signal?: AbortSignal,
  ) => Promise<PrivateExplanations>;
  askOnDevice: (
    question: string,
    plan: PlanResult,
    household: Household,
    options?: AskOptions,
  ) => Promise<PrivateAnswer>;
}

/** The SDK's `inferenceSource` as the app's engine name. A missing source means the cloud. */
export function engineOf(source: InferenceSource | undefined): AiEngine {
  return source === 'on_device' ? 'on-device' : 'cloud';
}

/** The error a stopped answer ends with, the same name `fetch` uses for an aborted request. */
function stopped(): DOMException {
  return new DOMException('The answer was stopped', 'AbortError');
}

/** A client for these settings. Nothing is loaded until the first call. */
export function createPrivateAi(settings: FirebaseSettings): PrivateAi {
  let models: Promise<HybridModels> | null = null;
  /** The last validated explanations, so returning to the page does not ask again. */
  let last: { prompt: string; result: PrivateExplanations } | null = null;

  const load = (): Promise<HybridModels> => {
    if (models) return models;
    const started = startFirebase(settings).then((app) =>
      createHybridModels(app, settings.cloudModel),
    );
    models = started;
    // A failed start (offline, blocked script) is retried on the next call.
    started.catch(() => {
      models = null;
    });
    return started;
  };

  return {
    async prepareOnDevice(onProgress) {
      const { explain, ask } = await load();
      // Without Gemini Nano, or without a user gesture for its download, the SDK rejects here;
      // both models then answer from the cloud, the documented PREFER_ON_DEVICE fallback.
      const ready = Promise.all(
        [explain, ask].map((model) =>
          model.initializeDeviceModel(onProgress).catch(() => undefined),
        ),
      );
      // A first download can take many minutes. Stop waiting after a while: the download
      // carries on in the background, and until it ends Firebase answers from the cloud.
      await Promise.race([ready, new Promise((done) => setTimeout(done, PREPARE_WAIT_MS))]);
    },

    async explainPlanOnDevice(plan, household, signal) {
      const prompt = buildExplainPrompt(plan, household);
      if (last?.prompt === prompt) return last.result;
      const { explain } = await load();
      const { response } = await explain.generateContent(prompt, { signal });
      const result = {
        why: parseExplanations(response.text(), plan),
        engine: engineOf(response.inferenceSource),
      };
      last = { prompt, result };
      return result;
    },

    async askOnDevice(question, plan, household, { onText, signal } = {}) {
      const { ask } = await load();
      const result = await ask.generateContentStream(buildAskPrompt(question, plan, household), {
        signal,
      });
      let text = '';
      let engine: AiEngine = 'cloud';
      for await (const chunk of result.stream) {
        if (signal?.aborted) throw stopped();
        engine = engineOf(chunk.inferenceSource);
        text += chunk.text();
        onText?.(text, engine);
      }
      return { text, engine };
    },
  };
}
