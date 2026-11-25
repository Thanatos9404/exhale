# Hybrid on-device AI with Firebase

Exhale explains each family's daily plan for smog season. With this feature, the explanations, and short questions about today's plan, can be answered by **Gemini Nano inside the user's own Chrome**, through **Firebase AI Logic** in hybrid mode. When Gemini Nano is not available, Firebase AI Logic falls back to **cloud Gemini** on its own. Every answer shows which engine wrote it, and **Firebase App Check** protects the cloud path.

This page is written for the judges of the Firebase #BuildHybridAI hackathon.

## What was built during the submission period (11 to 30 November 2026)

All of Exhale was built inside this contest's submission period. Its first commit is dated 24 November 2026: the deterministic planning engine and a server-side Gemini path (`/api/plan` and `/api/chat`), made for Hack2skill and Google for Developers' PromptWars, where it scored 96.85 out of 100. In that version the browser never called a model directly. The Firebase hybrid feature below was added on 24 and 25 November, for #BuildHybridAI.

| Piece                                    | What it does                                                                                                                                                                                                                                                                                                | Where                                                                                                                                                                                                            |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Firebase configuration                   | Reads the public `VITE_FIREBASE_*` web config once and validates it with zod. If any required value is missing, the feature is hidden and the app behaves exactly as before                                                                                                                                 | [src/services/firebase/config.ts](../src/services/firebase/config.ts)                                                                                                                                            |
| Firebase app and App Check               | `initializeApp`, then `initializeAppCheck` with the reCAPTCHA Enterprise provider (or reCAPTCHA v3) and token auto-refresh. In development builds, the App Check debug provider is switched on first                                                                                                        | [src/services/firebase/app.ts](../src/services/firebase/app.ts)                                                                                                                                                  |
| Hybrid model factory                     | `getAI` with the Gemini Developer API backend, then `getGenerativeModel` with `InferenceMode.PREFER_ON_DEVICE`. Each model gets the same system prompt on the device and in the cloud. The explanations model also gets its JSON schema in both places (`responseConstraint` and `responseSchema`)          | [src/services/firebase/model.ts](../src/services/firebase/model.ts)                                                                                                                                              |
| Typed client                             | `prepareOnDevice` (asks Chrome to get Gemini Nano ready and reports download progress), `explainPlanOnDevice(plan, household)` (validated explanations by action id) and `askOnDevice(question, plan, household)` (a streamed short answer). Every result names its engine from the SDK's `inferenceSource` | [src/services/firebase/client.ts](../src/services/firebase/client.ts)                                                                                                                                            |
| Shared prompt guardrails                 | The server's prompt code moved to `src/lib/prompts`, so the browser and the server use the same rules, the same tagged data blocks and the same neutralising of user text. `server/prompts.ts` re-exports it                                                                                                | [src/lib/prompts/](../src/lib/prompts/guardrails.ts), [onDevice.ts](../src/lib/prompts/onDevice.ts)                                                                                                              |
| Routine page                             | An "Explain on this device (Gemini Nano)" switch with a one-line privacy note, a live status line (download progress, result or failure) and an "On-device" or "Cloud (Firebase)" badge. The explanations under each action then come from the hybrid model                                                 | [src/pages/routine/PrivateExplainCard.tsx](../src/pages/routine/PrivateExplainCard.tsx), [usePrivateExplanations.ts](../src/pages/routine/usePrivateExplanations.ts)                                             |
| Assistant                                | The same choice in the composer. Private answers stream into the conversation, carry the engine badge and never reach `/api/chat`                                                                                                                                                                           | [src/pages/assistant/answer.ts](../src/pages/assistant/answer.ts), [Composer.tsx](../src/pages/assistant/Composer.tsx)                                                                                           |
| One shared choice                        | Switching it on in one place switches it on in the other, and the browser remembers it. Requests wait until Gemini Nano has been prepared, so a download in progress is not mistaken for "unavailable"                                                                                                      | [src/state/privateAiChoice.ts](../src/state/privateAiChoice.ts), [src/hooks/usePrivateAi.ts](../src/hooks/usePrivateAi.ts)                                                                                       |
| Lazy loading, CSP, layering, tests, docs | The Firebase SDK is a separate chunk that loads only when the feature is used. The CSP allows exactly the documented hosts. A layer rule keeps the SDK inside `src/services/firebase`. The SDK is mocked in tests, so they never call the network                                                           | [vite.config.ts](../vite.config.ts), [vercel.json](../vercel.json), [tests/architecture.test.ts](../tests/architecture.test.ts), [src/services/firebase/client.test.ts](../src/services/firebase/client.test.ts) |

## Why on-device matters for health data

To explain a plan well, the model has to know the household: who has asthma, a heart condition or COPD, the ages of the children, when each person exercises, when the commuter leaves and how the home is heated. That is health data about a family, and most of it is about people who never agreed to share it.

On the server path, this profile goes to a cloud model with every request. On the on-device path, the prompt is built in the browser and answered by Gemini Nano in the browser, so **the household's details never leave the device**. There is no account and no server log of the prompt. When Gemini Nano is unavailable and Firebase answers from the cloud, the badge says **Cloud (Firebase)** so the family always knows where their data went. The privacy note under the switch says the same in one line.

## How the hybrid fallback works

```
Switch on (a click: Chrome needs a user gesture to download a model)
  └─ prepareOnDevice: start Firebase + App Check, model.initializeDeviceModel(progress)
       └─ explainPlanOnDevice / askOnDevice
            ├─ Gemini Nano available in this Chrome  → answered on the device      → badge "On-device"
            ├─ not available (other browser, no flag) → Firebase AI Logic, cloud    → badge "Cloud (Firebase)"
            │                                           Gemini (App Check token sent)
            └─ Firebase unreachable or answer invalid → Routine keeps the server's explanations and says so;
                                                        the Assistant puts the question back in the box
```

- **Mode.** Both models use `InferenceMode.PREFER_ON_DEVICE`, so the SDK decides per request and reports its choice in `response.inferenceSource` (`on_device` or `in_cloud`). The badge maps that value directly ([client.ts](../src/services/firebase/client.ts), `engineOf`).
- **Download.** `initializeDeviceModel` is called from the switch's click handler, which counts as the user gesture Chrome requires. Requests wait for it, and progress is announced in the status line.
- **Cloud model.** `gemini-3.5-flash-lite`, the SDK's documented hybrid default. It can be changed with `VITE_FIREBASE_AI_CLOUD_MODEL`.
- **Single turn.** On-device inference does not support multi-turn chat, so each private question carries today's plan, the household and the question, but not the earlier turns. Web search is not available on the device, so the web-search switch steps aside while private answers are on.
- **The server path is unchanged.** Deploying a plan still uses Gemini, then Claude Haiku, then the rules engine ([ARCHITECTURE.md](ARCHITECTURE.md#ai-fallback-chain-server)).

## Correctness and privacy guarantees

| Guarantee                                        | How                                                                                                                                                                                                                 | Test                                                                                                                                                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The on-device prompt has the server's guardrails | `EXPLAIN_SYSTEM` and `ASK_SYSTEM` are built from the same `GUARDRAILS` and `STYLE` as the server prompts. CONTEXT comes from the same `describePlan` and `describeHousehold`                                        | [src/lib/prompts/onDevice.test.ts](../src/lib/prompts/onDevice.test.ts)                                                                                                                                               |
| User text is data, never instructions            | Names, the place label and the question are neutralised and wrapped in `<household>`, `<name>`, `<place>`, `<item>` and `<user>` tags                                                                               | Same file: a `</household>` breakout in the household name and a `</user>` breakout in the question                                                                                                                   |
| Numbers come only from the engine                | The model writes words only. Explanations are validated with the server's zod schema (`aiPlanSchema.shape.items`), ids the plan does not contain are dropped, and an answer that explains no real action is refused | Same file, `parseExplanations`; [client.test.ts](../src/services/firebase/client.test.ts) "rejects output that is not valid explanations"                                                                             |
| The engine badge is truthful                     | It is read from the SDK's `inferenceSource` on every response and stored with each Assistant answer                                                                                                                 | [client.test.ts](../src/services/firebase/client.test.ts), [PrivateExplainCard.test.tsx](../src/pages/routine/PrivateExplainCard.test.tsx), [privateAnswers.test.tsx](../src/pages/assistant/privateAnswers.test.tsx) |
| A private question never reaches `/api/chat`     | The Assistant routes it to the hybrid client                                                                                                                                                                        | [privateAnswers.test.tsx](../src/pages/assistant/privateAnswers.test.tsx)                                                                                                                                             |
| Without Firebase, nothing changes                | The client is null, the switch is not rendered, and no Firebase code is downloaded                                                                                                                                  | [config.test.ts](../src/services/firebase/config.test.ts), [PrivateAi.test.tsx](../src/components/PrivateAi.test.tsx)                                                                                                 |
| The switch is accessible                         | A `role="switch"` button with a visible label, described by the privacy note, operable with Tab, Space and Enter. Status changes are announced in a polite live region                                              | [PrivateAi.test.tsx](../src/components/PrivateAi.test.tsx) (axe and keyboard), [PrivateExplainCard.test.tsx](../src/pages/routine/PrivateExplainCard.test.tsx) (axe)                                                  |
| The App Check debug provider never ships         | `debugToken` is `null` unless the build is a development build                                                                                                                                                      | [config.test.ts](../src/services/firebase/config.test.ts)                                                                                                                                                             |
| The first load stays small                       | `firebase/app`, `firebase/app-check` and `firebase/ai` are only imported with `import()`, into a `firebase` chunk that the bundle check refuses to preload                                                          | [tests/architecture.test.ts](../tests/architecture.test.ts), [scripts/check-bundle.mjs](../scripts/check-bundle.mjs)                                                                                                  |

## Content Security Policy additions

Each host comes from the official documentation or from the SDK's own source. [tests/conventions.test.ts](../tests/conventions.test.ts) asserts the exact list.

| Directive     | Added                                                                          | Why                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `connect-src` | `https://firebasevertexai.googleapis.com`                                      | The Firebase AI Logic endpoint that `firebase/ai` calls for the cloud fallback                                          |
| `connect-src` | `https://content-firebaseappcheck.googleapis.com`                              | The App Check token exchange                                                                                            |
| `connect-src` | `https://www.google.com/recaptcha/`                                            | reCAPTCHA, as listed in Google's reCAPTCHA FAQ for sites with a CSP                                                     |
| `script-src`  | `https://www.google.com/recaptcha/`, `https://www.gstatic.com/recaptcha/`      | The reCAPTCHA Enterprise (`enterprise.js`) or v3 (`api.js`) script that App Check loads, and the files it loads in turn |
| `frame-src`   | `https://www.google.com/recaptcha/`, `https://recaptcha.google.com/recaptcha/` | The invisible reCAPTCHA frame                                                                                           |

`script-src` still has no `'unsafe-inline'` and no `'unsafe-eval'`.

## How to enable it

### 1. Firebase console (a person must do this; no project was created for this repository)

1. **Create a project** at [console.firebase.google.com](https://console.firebase.google.com). Google Analytics is not needed.
2. **Enable AI Logic.** Go to **AI Services > AI Logic**, click **Get started** and choose the **Gemini Developer API** (no cost on the Spark plan). The console enables the required APIs and creates a Gemini API key inside the project. Do not copy that key into this repository: the SDK never needs it. The same workflow enforces App Check for AI Logic.
3. **Register the web app.** In **Project settings > General > Your apps**, add a **Web** app. Copy `apiKey`, `projectId`, `appId` (and optionally `authDomain` and `messagingSenderId`) into the variables below.
4. **Set up App Check with reCAPTCHA Enterprise.**
   - In the Google Cloud console, open **Security > reCAPTCHA** for the same project. Enable the API if asked, then create a **Web** key that is score-based (leave the checkbox challenge off). Add the domain `exhale-air.vercel.app`, and any preview domains you deploy to. Never add `localhost` to this key.
   - In the Firebase console, open **Security > App Check > Apps** and register the web app with the **reCAPTCHA Enterprise** provider and that key.
   - On the **APIs** tab, check that **Firebase AI Logic** shows as enforced.
   - To use reCAPTCHA v3 instead, register a v3 site key and set `VITE_FIREBASE_APPCHECK_PROVIDER=recaptcha-v3`.
5. **Create a debug token** for local development and judging. In **Security > App Check > Apps**, open the app's overflow menu, choose **Manage debug tokens** and add a token. Put it in `.env.local` as `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN`. Alternatively, leave that variable empty, run `npm run dev`, copy the `AppCheck debug token` that the SDK prints in the browser console, and register it the same way. Keep debug tokens private and delete them after judging.
6. **Authorised domains.** App Check trusts only the domains on the reCAPTCHA key (step 4), so `exhale-air.vercel.app` must be listed there. Exhale uses no Firebase Authentication, so the **Authentication > Settings > Authorized domains** list is not used by this feature; adding `exhale-air.vercel.app` there does no harm. Optionally, restrict the browser API key in **Google Cloud > APIs & Services > Credentials** to the HTTP referrers `https://exhale-air.vercel.app/*` and `http://localhost:5173/*`.
7. **Vercel.** Add the same `VITE_FIREBASE_*` variables (without the debug token) in the Vercel project settings, then redeploy. Vite reads them at build time.

### 2. Environment variables

| Variable                             | Required | Value                                                                                                    |
| ------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------- |
| `VITE_FIREBASE_API_KEY`              | Yes      | `apiKey` from the web app config                                                                         |
| `VITE_FIREBASE_PROJECT_ID`           | Yes      | `projectId`                                                                                              |
| `VITE_FIREBASE_APP_ID`               | Yes      | `appId`                                                                                                  |
| `VITE_FIREBASE_APPCHECK_SITE_KEY`    | Yes      | The reCAPTCHA site key registered with App Check                                                         |
| `VITE_FIREBASE_AUTH_DOMAIN`          | No       | `authDomain`                                                                                             |
| `VITE_FIREBASE_MESSAGING_SENDER_ID`  | No       | `messagingSenderId`                                                                                      |
| `VITE_FIREBASE_APPCHECK_PROVIDER`    | No       | `recaptcha-enterprise` (default) or `recaptcha-v3`                                                       |
| `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN` | No       | A registered debug token. Used only by `npm run dev`; without it, development builds ask the SDK for one |
| `VITE_FIREBASE_AI_CLOUD_MODEL`       | No       | The cloud fallback model. Defaults to `gemini-3.5-flash-lite`                                            |

A Firebase web config is public by design: it identifies the project, while App Check and the console decide who may use it. It is safe in the client bundle. The Gemini API key stays inside the Firebase project and the server keys stay on the server. A convention test checks that the only browser module reading the environment is [config.ts](../src/services/firebase/config.ts), and that it reads only `VITE_FIREBASE_*` names.

### 3. Chrome with Gemini Nano

1. Use Chrome **139 or later** on desktop.
2. Set `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` to **Enabled**, then restart Chrome.
3. Optionally, download the model before the first request. In the DevTools console, run `await LanguageModel.availability()`. If it says `downloadable`, run `await LanguageModel.create()`. Otherwise, the switch starts the download and the status line shows its progress.

### 4. Try it

1. Run `npm run dev` with the variables in `.env.local`, then open <http://localhost:5173/routine>.
2. Switch on **Explain on this device (Gemini Nano)**. The status line reports the download, then "Explained by Gemini Nano on this device", and the badge reads **On-device**. Open any action to read its explanation.
3. In another browser, or with the flag off, the same switch answers from the cloud and the badge reads **Cloud (Firebase)**.
4. On the Assistant page, switch on **Answer on this device (Gemini Nano)** and ask "When can Kid play outside today?". The answer streams with its badge, and DevTools shows no request to `/api/chat`.

## Limits

- Hybrid inference in Firebase AI Logic is a Preview feature, and on-device inference runs only in desktop Chrome.
- On-device answers are single-turn and cannot search the web.
- Firebase AI monitoring shows cloud requests only. On-device requests are not logged anywhere, which is the point.
