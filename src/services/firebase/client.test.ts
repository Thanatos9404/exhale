import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPlan } from '@/lib/planner/engine';
import { DEFAULT_HOUSEHOLD } from '@/lib/profile/schema';
import { ASK_SYSTEM, EXPLAIN_SYSTEM } from '@/lib/prompts/onDevice';
import { PLAN_EXPLANATIONS_JSON_SCHEMA } from '@/lib/prompts/jsonSchema';
import { makeSnapshot } from '@/test/fixtures';
import { createPrivateAi, engineOf, PREPARE_WAIT_MS } from './client';
import type { FirebaseSettings } from './config';

/**
 * The Firebase layer against a mocked SDK: `firebase/app`, `firebase/app-check` and `firebase/ai`
 * are replaced, so nothing here reaches the network. The tests pin down the documented setup
 * (App Check before AI Logic, the hybrid PREFER_ON_DEVICE mode, the schema in both places a model
 * can run), the engine badge, the validation of model output, and the cloud fallback.
 */

const sdk = vi.hoisted(() => {
  /** A stand-in GenerativeModel; each test scripts what it answers. */
  const makeModel = () => ({
    initializeDeviceModel: vi.fn(async (_progress?: (fraction: number) => void) => {}),
    generateContent: vi.fn(),
    generateContentStream: vi.fn(),
  });
  return {
    makeModel,
    models: [] as ReturnType<typeof makeModel>[],
    initializeApp: vi.fn((options: object) => ({ name: '[DEFAULT]', options })),
    initializeAppCheck: vi.fn(),
    debugTokenAtAppCheck: null as boolean | string | null,
    getAI: vi.fn(() => ({ kind: 'ai' })),
    getGenerativeModel: vi.fn(),
  };
});

vi.mock('firebase/app', () => ({ initializeApp: sdk.initializeApp }));
vi.mock('firebase/app-check', () => ({
  initializeAppCheck: sdk.initializeAppCheck,
  ReCaptchaEnterpriseProvider: class {
    readonly kind = 'recaptcha-enterprise';
    constructor(readonly siteKey: string) {}
  },
  ReCaptchaV3Provider: class {
    readonly kind = 'recaptcha-v3';
    constructor(readonly siteKey: string) {}
  },
}));
vi.mock('firebase/ai', () => ({
  getAI: sdk.getAI,
  getGenerativeModel: sdk.getGenerativeModel,
  GoogleAIBackend: class {
    readonly backendType = 'GOOGLE_AI';
  },
  InferenceMode: {
    PREFER_ON_DEVICE: 'prefer_on_device',
    ONLY_ON_DEVICE: 'only_on_device',
    ONLY_IN_CLOUD: 'only_in_cloud',
    PREFER_IN_CLOUD: 'prefer_in_cloud',
  },
}));

const settings: FirebaseSettings = {
  app: { apiKey: 'test-web-api-key', projectId: 'exhale-test', appId: '1:123:web:abc' },
  appCheck: { provider: 'recaptcha-enterprise', siteKey: 'test-site-key', debugToken: null },
  cloudModel: 'gemini-test-model',
};
const plan = buildPlan(DEFAULT_HOUSEHOLD, makeSnapshot(), new Date('2026-11-23T00:00:00Z'));
const ids = plan.items.map((item) => item.id);
const explanations = JSON.stringify({ items: ids.map((id) => ({ id, why: `Why ${id}` })) });

/** A non-streaming response, as the SDK shapes it. */
const response = (text: string, source: 'on_device' | 'in_cloud') => ({
  response: { text: () => text, inferenceSource: source },
});

/** A streaming response whose chunks arrive from `source`. */
function streamOf(chunks: string[], source: 'on_device' | 'in_cloud') {
  async function* stream() {
    for (const text of chunks) yield { text: () => text, inferenceSource: source };
  }
  return { stream: stream(), response: Promise.resolve({}) };
}

const explainModel = () => sdk.models[0]!;
const askModel = () => sdk.models[1]!;

beforeEach(() => {
  sdk.models.length = 0;
  sdk.getGenerativeModel.mockImplementation(() => {
    const model = sdk.makeModel();
    sdk.models.push(model);
    return model;
  });
  sdk.initializeAppCheck.mockImplementation(() => {
    sdk.debugTokenAtAppCheck = Reflect.get(self, 'FIREBASE_APPCHECK_DEBUG_TOKEN') ?? null;
  });
});

afterEach(() => {
  vi.clearAllMocks();
  Reflect.deleteProperty(self, 'FIREBASE_APPCHECK_DEBUG_TOKEN');
});

describe('initialisation', () => {
  it('loads nothing until the first call', () => {
    createPrivateAi(settings);
    expect(sdk.initializeApp).not.toHaveBeenCalled();
    expect(sdk.getGenerativeModel).not.toHaveBeenCalled();
  });

  it('starts Firebase with the web config and App Check with reCAPTCHA Enterprise', async () => {
    await createPrivateAi(settings).prepareOnDevice();
    expect(sdk.initializeApp).toHaveBeenCalledWith(settings.app);
    const [app, options] = sdk.initializeAppCheck.mock.calls[0]!;
    expect(app).toEqual({ name: '[DEFAULT]', options: settings.app });
    expect(options).toEqual({
      provider: expect.objectContaining({ kind: 'recaptcha-enterprise', siteKey: 'test-site-key' }),
      isTokenAutoRefreshEnabled: true,
    });
  });

  it('can attest with reCAPTCHA v3 instead', async () => {
    const v3 = {
      ...settings,
      appCheck: { ...settings.appCheck, provider: 'recaptcha-v3' as const },
    };
    await createPrivateAi(v3).prepareOnDevice();
    expect(sdk.initializeAppCheck.mock.calls[0]![1].provider).toMatchObject({
      kind: 'recaptcha-v3',
    });
  });

  it('sets the App Check debug token before App Check starts, in development only', async () => {
    const dev = { ...settings, appCheck: { ...settings.appCheck, debugToken: true as const } };
    await createPrivateAi(dev).prepareOnDevice();
    expect(sdk.debugTokenAtAppCheck).toBe(true);

    Reflect.deleteProperty(self, 'FIREBASE_APPCHECK_DEBUG_TOKEN');
    await createPrivateAi(settings).prepareOnDevice();
    expect(sdk.debugTokenAtAppCheck).toBeNull();
  });

  it('starts Firebase once however many calls are made', async () => {
    const ai = createPrivateAi(settings);
    await Promise.all([ai.prepareOnDevice(), ai.prepareOnDevice()]);
    expect(sdk.initializeApp).toHaveBeenCalledTimes(1);
    expect(sdk.getGenerativeModel).toHaveBeenCalledTimes(2);
  });

  it('tries again after a failed start', async () => {
    sdk.initializeApp.mockImplementationOnce(() => {
      throw new Error('blocked');
    });
    const ai = createPrivateAi(settings);
    await expect(ai.prepareOnDevice()).rejects.toThrow('blocked');
    await ai.prepareOnDevice();
    expect(sdk.initializeApp).toHaveBeenCalledTimes(2);
  });
});

describe('hybrid models', () => {
  it('uses the Gemini Developer API backend and the PREFER_ON_DEVICE hybrid mode', async () => {
    await createPrivateAi(settings).prepareOnDevice();
    expect(sdk.getAI).toHaveBeenCalledWith(expect.anything(), {
      backend: expect.objectContaining({ backendType: 'GOOGLE_AI' }),
    });
    for (const [ai, params] of sdk.getGenerativeModel.mock.calls) {
      expect(ai).toEqual({ kind: 'ai' });
      expect(params.mode).toBe('prefer_on_device');
      expect(params.inCloudParams.model).toBe('gemini-test-model');
    }
  });

  it('gives the explanations model its system prompt and JSON schema in the cloud and on device', async () => {
    await createPrivateAi(settings).prepareOnDevice();
    const [, params] = sdk.getGenerativeModel.mock.calls[0]!;
    expect(params.inCloudParams.systemInstruction).toBe(EXPLAIN_SYSTEM);
    expect(params.inCloudParams.generationConfig).toMatchObject({
      responseMimeType: 'application/json',
      responseSchema: PLAN_EXPLANATIONS_JSON_SCHEMA,
    });
    expect(params.onDeviceParams.promptOptions.responseConstraint).toBe(
      PLAN_EXPLANATIONS_JSON_SCHEMA,
    );
    expect(params.onDeviceParams.createOptions.initialPrompts).toEqual([
      { role: 'system', content: [{ type: 'text', value: EXPLAIN_SYSTEM }] },
    ]);
    expect(params.onDeviceParams.createOptions.expectedInputs).toEqual([
      { type: 'text', languages: ['en'] },
    ]);
  });

  it('gives the answers model plain text output with the chat guardrails', async () => {
    await createPrivateAi(settings).prepareOnDevice();
    const [, params] = sdk.getGenerativeModel.mock.calls[1]!;
    expect(params.inCloudParams.systemInstruction).toBe(ASK_SYSTEM);
    expect(params.inCloudParams.generationConfig.responseMimeType).toBeUndefined();
    expect(params.onDeviceParams.promptOptions).toBeUndefined();
    expect(params.onDeviceParams.createOptions.initialPrompts[0].content[0].value).toBe(ASK_SYSTEM);
  });
});

describe('prepareOnDevice', () => {
  it('asks Chrome for Gemini Nano and reports download progress', async () => {
    const progress = vi.fn();
    const ai = createPrivateAi(settings);
    sdk.getGenerativeModel.mockImplementationOnce(() => {
      const model = sdk.makeModel();
      model.initializeDeviceModel.mockImplementation(async (report) => report?.(0.5));
      sdk.models.push(model);
      return model;
    });
    await ai.prepareOnDevice(progress);
    expect(explainModel().initializeDeviceModel).toHaveBeenCalledWith(progress);
    expect(askModel().initializeDeviceModel).toHaveBeenCalledWith(progress);
    expect(progress).toHaveBeenCalledWith(0.5);
  });

  it('resolves when Gemini Nano cannot be prepared, leaving the cloud fallback', async () => {
    sdk.getGenerativeModel.mockImplementation(() => {
      const model = sdk.makeModel();
      model.initializeDeviceModel.mockRejectedValue(new Error('requires a user gesture'));
      sdk.models.push(model);
      return model;
    });
    await expect(createPrivateAi(settings).prepareOnDevice()).resolves.toBeUndefined();
  });

  it('stops waiting for a slow download, so Firebase can answer from the cloud meanwhile', async () => {
    sdk.getGenerativeModel.mockImplementation(() => {
      const model = sdk.makeModel();
      model.initializeDeviceModel.mockReturnValue(new Promise<void>(() => {}));
      sdk.models.push(model);
      return model;
    });
    vi.useFakeTimers();
    try {
      const prepared = createPrivateAi(settings).prepareOnDevice();
      await vi.advanceTimersByTimeAsync(PREPARE_WAIT_MS);
      await expect(prepared).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('explainPlanOnDevice', () => {
  it('returns validated explanations by action id, written on the device', async () => {
    const ai = createPrivateAi(settings);
    await ai.prepareOnDevice();
    explainModel().generateContent.mockResolvedValue(response(explanations, 'on_device'));
    const result = await ai.explainPlanOnDevice(plan, DEFAULT_HOUSEHOLD);
    expect(result.engine).toBe('on-device');
    expect(result.why.get(ids[0]!)).toBe(`Why ${ids[0]}`);
    const [prompt] = explainModel().generateContent.mock.calls[0]!;
    expect(prompt).toContain('<household>');
    expect(prompt).toMatch(/TASK\nWrite a personal "why"/);
  });

  it('falls back to cloud Gemini through Firebase when on-device is unavailable', async () => {
    const ai = createPrivateAi(settings);
    await ai.prepareOnDevice();
    explainModel().generateContent.mockResolvedValue(response(explanations, 'in_cloud'));
    const result = await ai.explainPlanOnDevice(plan, DEFAULT_HOUSEHOLD);
    expect(result.engine).toBe('cloud');
    expect(result.why.size).toBe(ids.length);
  });

  it('rejects output that is not valid explanations', async () => {
    const ai = createPrivateAi(settings);
    await ai.prepareOnDevice();
    for (const bad of ['not json', '{"items":[{"id":"x"}]}', '{"items":[{"id":"x","why":"y"}]}']) {
      explainModel().generateContent.mockResolvedValueOnce(response(bad, 'on_device'));
      await expect(ai.explainPlanOnDevice(plan, DEFAULT_HOUSEHOLD)).rejects.toThrow(
        /explanations were rejected/,
      );
    }
  });

  it('answers the same plan again from memory, without a second model call', async () => {
    const ai = createPrivateAi(settings);
    await ai.prepareOnDevice();
    explainModel().generateContent.mockResolvedValue(response(explanations, 'on_device'));
    const first = await ai.explainPlanOnDevice(plan, DEFAULT_HOUSEHOLD);
    const second = await ai.explainPlanOnDevice(plan, DEFAULT_HOUSEHOLD);
    expect(second).toBe(first);
    expect(explainModel().generateContent).toHaveBeenCalledTimes(1);
  });

  it('passes the abort signal to the SDK', async () => {
    const ai = createPrivateAi(settings);
    await ai.prepareOnDevice();
    explainModel().generateContent.mockResolvedValue(response(explanations, 'on_device'));
    const ctrl = new AbortController();
    await ai.explainPlanOnDevice(plan, DEFAULT_HOUSEHOLD, ctrl.signal);
    expect(explainModel().generateContent.mock.calls[0]![1]).toEqual({ signal: ctrl.signal });
  });
});

describe('askOnDevice', () => {
  it('streams a short answer and reports the engine with every chunk', async () => {
    const ai = createPrivateAi(settings);
    await ai.prepareOnDevice();
    askModel().generateContentStream.mockResolvedValue(
      streamOf(['Stay in ', 'until 11.'], 'on_device'),
    );
    const onText = vi.fn();
    const answer = await ai.askOnDevice('When can we go out?', plan, DEFAULT_HOUSEHOLD, { onText });
    expect(answer).toEqual({ text: 'Stay in until 11.', engine: 'on-device' });
    expect(onText.mock.calls).toEqual([
      ['Stay in ', 'on-device'],
      ['Stay in until 11.', 'on-device'],
    ]);
    const [prompt] = askModel().generateContentStream.mock.calls[0]!;
    expect(prompt).toMatch(/QUESTION\n<user>When can we go out\?<\/user>$/);
  });

  it('says Cloud when Firebase answered in the cloud', async () => {
    const ai = createPrivateAi(settings);
    await ai.prepareOnDevice();
    askModel().generateContentStream.mockResolvedValue(streamOf(['From the cloud.'], 'in_cloud'));
    const answer = await ai.askOnDevice('Hi', plan, DEFAULT_HOUSEHOLD);
    expect(answer.engine).toBe('cloud');
  });

  it('stops with an AbortError when the user stops the answer', async () => {
    const ai = createPrivateAi(settings);
    await ai.prepareOnDevice();
    askModel().generateContentStream.mockResolvedValue(streamOf(['One', 'Two'], 'on_device'));
    const ctrl = new AbortController();
    const onText = vi.fn(() => ctrl.abort());
    await expect(
      ai.askOnDevice('Hi', plan, DEFAULT_HOUSEHOLD, { onText, signal: ctrl.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(onText).toHaveBeenCalledTimes(1);
  });
});

describe('engineOf', () => {
  it('maps the SDK inference source to the badge engine', () => {
    expect(engineOf('on_device')).toBe('on-device');
    expect(engineOf('in_cloud')).toBe('cloud');
    expect(engineOf(undefined)).toBe('cloud');
  });
});
