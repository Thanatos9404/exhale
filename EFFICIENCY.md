# Efficiency

How Exhale keeps the first load small, the planner instant and the AI bill low. The budgets below are enforced in CI, and each measured figure says how it was measured.

## Bundle size, with a budget that fails the build

`npm run bundle:check` ([scripts/check-bundle.mjs](scripts/check-bundle.mjs)) runs after every build in [CI](.github/workflows/ci.yml) and exits non-zero when a budget is exceeded. [tests/docs.test.ts](tests/docs.test.ts) fails if the budgets quoted here drift from the script.

| What                                                              | Measured (gzip)    | Budget |
| ----------------------------------------------------------------- | ------------------ | ------ |
| JavaScript needed for first paint                                 | 138.8 kB           | 170 kB |
| Stylesheet                                                        | 10.3 kB            | 15 kB  |
| Largest route chunk (Forecast)                                    | 19.8 kB            | 25 kB  |
| Other route chunks (Routine, Impact, Indoor, Assistant, Settings) | 3.0 to 9.8 kB each | 25 kB  |

Measured on the production build of 24 November 2026 with `npx vite build && npm run bundle:check`.

The same script fails the build if any of these libraries is preloaded on first paint:

| Library                                        | Size (gzip) | When it loads                                                        |
| ---------------------------------------------- | ----------- | -------------------------------------------------------------------- |
| three.js and React Three Fiber                 | 246.8 kB    | When the 3D view is on screen and the browser is idle, or on request |
| motion                                         | 48.2 kB     | With the Routine page, which animates the build log                  |
| Command menu and toaster (cmdk, Radix, sonner) | 25.7 kB     | When the browser is idle, or on the first Ctrl+K                     |
| GSAP                                           | 27.8 kB     | With the inversion diagram                                           |
| Markdown renderer                              | 35.7 kB     | With the first assistant answer                                      |
| Firebase (app, App Check, AI Logic)            | 24.3 kB     | Only when private on-device answers are switched on                  |

How the first load stays small:

- **Route-level code splitting.** Six of the seven pages are `lazy()` imports in [src/App.tsx](src/App.tsx).
- **The 3D scene waits its turn.** The landing page shows a lightweight SVG poster with the same facts. three.js is fetched only once that poster is on screen and the browser is idle. People on a data-saver connection never download it unless they press "Show 3D view" ([AirColumnPreview.tsx](src/pages/overview/AirColumnPreview.tsx), [useIdleInView.ts](src/hooks/useIdleInView.ts), [AirColumnPreview.test.tsx](src/pages/overview/AirColumnPreview.test.tsx)).
- **No animation library on first paint.** The tab indicator and the row panels use the Web Animations API and CSS transitions ([SharedIndicator.tsx](src/components/shell/SharedIndicator.tsx)).
- **Long-lived vendor chunks.** `manualChunks` in [vite.config.ts](vite.config.ts) separates React, data and UI libraries, and `/assets/*` is served `immutable` for a year ([vercel.json](vercel.json)), so a deploy re-downloads only what changed.
- **Critical path.** `index.html` preconnects to the two Open-Meteo hosts and preloads the one Latin font file the first screen uses.

## The planner: about 2 ms per plan

The engine in [src/lib/planner](src/lib/planner/) is pure TypeScript with no I/O. On a laptop, simulating three people over 24 hours, testing every candidate change and re-checking the combined plan so that no change makes anyone worse off took **1.74 ms** (mean of 300 runs over a 120-hour forecast, 24 November 2026). [tests/performance.test.ts](tests/performance.test.ts) holds a looser budget of 15 ms so that slow CI machines never flake, and it checks that an eight-person household stays within four times that.

- Each action is scored by re-simulating one day with one change, so cost grows linearly with members, hours and actions.
- That speed is why the what-if toggles on the Impact page and the sliders in the Indoor lab recompute the whole day on every change, with no debounce and no server call.

## Network: fetch once, reuse it

| Layer   | What is cached                                                                                   | For how long                             | Where                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Browser | Air and weather snapshot per place, shared by every page and by the deploy action                | Fresh for 10 minutes, refreshed every 15 | [src/hooks/useAir.ts](src/hooks/useAir.ts), [src/state/runDeployment.ts](src/state/runDeployment.ts) |
| Server  | Air snapshot per 1 km cell, including in-flight requests, so concurrent requests share one fetch | 10 minutes, at most 500 cells            | [server/airCache.ts](server/airCache.ts)                                                             |
| Server  | A failed air fetch, so requests do not queue behind a dead upstream                              | 30 seconds                               | [server/airCache.ts](server/airCache.ts)                                                             |
| Server  | Validated AI explanations, keyed on a hash of the prompt                                         | 10 minutes, at most 200 plans            | [server/planCache.ts](server/planCache.ts)                                                           |
| CDN     | `/api/health`                                                                                    | 5 minutes, then stale-while-revalidate   | [api/health.ts](api/health.ts)                                                                       |
| CDN     | Hashed assets                                                                                    | 1 year, immutable                        | [vercel.json](vercel.json)                                                                           |

- Coordinates are rounded to about 1 km before they become a cache key, so neighbours hit the same entry ([openMeteo.ts](src/lib/air/openMeteo.ts)).
- City search is debounced by 250 ms, and every keystroke aborts the previous request ([usePlaceSearch.ts](src/components/shell/usePlaceSearch.ts)).
- The health check runs only where its badge is shown, and not at all on phones ([Header.tsx](src/components/shell/Header.tsx)).
- Server caches live in function memory, so they are per instance. The plan and chat endpoints recompute the plan on the server by design: the server never trusts numbers sent by a browser.

Proven by [server/airCache.test.ts](server/airCache.test.ts), [server/planCache.test.ts](server/planCache.test.ts), [src/state/runDeployment.test.ts](src/state/runDeployment.test.ts) and [src/components/shell/shell.test.tsx](src/components/shell/shell.test.tsx).

## AI: pay for wording, not for arithmetic

| Decision                                                                                                                                                   | Effect                                                                                    | Where                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The deterministic engine does the reasoning; the model only explains and personalises                                                                      | Short prompts, short answers, no tool loops                                               | [server/prompts.ts](server/prompts.ts)                                                                                                                                                 |
| Identical prompts within 10 minutes are answered from the plan cache                                                                                       | Every first-time visitor with the default household costs one generation, not one each    | [server/planCache.ts](server/planCache.ts)                                                                                                                                             |
| Model order is configurable; the deployed app puts Flash-Lite first, then Flash                                                                            | The cheapest model that does the job answers first                                        | [server/gemini/candidates.ts](server/gemini/candidates.ts), [.env.example](.env.example)                                                                                               |
| Thinking level set to low                                                                                                                                  | Lower latency and cost, because the numbers are already computed                          | [server/gemini/config.ts](server/gemini/config.ts)                                                                                                                                     |
| Output capped at 4,096 tokens for plans, and 1,500 (Gemini) or 2,000 (Claude) for chat; history capped at 16 turns and trimmed before it enters the prompt | Bounded cost per request                                                                  | [server/gemini/json.ts](server/gemini/json.ts), [server/gemini/stream.ts](server/gemini/stream.ts), [server/claude.ts](server/claude.ts), [server/chatPrompt.ts](server/chatPrompt.ts) |
| A second candidate starts only after 7 seconds of silence                                                                                                  | No duplicate calls when the first model is healthy                                        | [server/gemini/hedged.ts](server/gemini/hedged.ts)                                                                                                                                     |
| One 50 second deadline per request, shared by every provider                                                                                               | A bad day ends in the rules fallback, never in a timed-out function billed for 60 seconds | [server/deadline.ts](server/deadline.ts)                                                                                                                                               |
| Circuit breaker and per-instance call budgets (60 Gemini and 20 Claude calls a minute)                                                                     | No requests wasted on a provider that is down, and no unbounded fan-out                   | [server/gemini/breaker.ts](server/gemini/breaker.ts), [server/gemini/budget.ts](server/gemini/budget.ts)                                                                               |
| Google Search grounding is opt-in per question and has its own tighter rate limit                                                                          | The costlier grounded call runs only when asked for                                       | [api/chat.ts](api/chat.ts)                                                                                                                                                             |
| Without any key, plans and chat still work from the engine                                                                                                 | Zero AI cost in the worst case                                                            | [server/fallback.ts](server/fallback.ts)                                                                                                                                               |

## Rendering: work only when something changes

- **One draw call for thousands of particles.** The 3D air column and the particle donut are custom shaders on a single `points` mesh, animated on the GPU: up to 9,000 particles ([smogShader.ts](src/components/three/smogShader.ts), [AirColumnScene.tsx](src/components/three/AirColumnScene.tsx)). The WebGL canvases cap device pixel ratio at 1.75 and ask for the low-power GPU.
- **Loops that stop.** The assistant's orb draws one frame and stops when it is idle. The 3D scenes, the room simulation and the GSAP diagram pause when offscreen or when the tab is hidden ([orbLoop.ts](src/components/orbLoop.ts), [inversionAnimation.ts](src/components/inversionAnimation.ts)). Proven by [ParticleOrb.test.tsx](src/components/ParticleOrb.test.tsx).
- **No per-frame style reads or allocations.** Canvas colours are read once and again on theme change, and the scenes reuse their colour objects.
- **Chat streams without re-rendering history.** Finished messages are memoised, the draft lives in the composer, and streamed text is applied once per animation frame. A render-counter test proves a finished message does not re-render while another streams ([conversation.test.tsx](src/pages/assistant/conversation.test.tsx)).
- **Charts.** Plain SVG built with d3-shape and d3-scale, with static layers memoised so a pointer move redraws only the cursor ([AreaChart.tsx](src/components/charts/AreaChart.tsx)).

## Limits of this evidence

- Bundle sizes and the planner timing are from one machine on one date. The budgets, not the measured figures, are what CI enforces.
- No Lighthouse or field data is recorded in this repository.
- Server caches and budgets are per instance. A shared store would be needed to make them global.

## Verify it yourself

```bash
npm run build && npm run bundle:check       # prints the size table and enforces the budgets
npx vitest run tests/performance.test.ts    # the planner budget
npm test                                    # includes the cache, deadline, hedging and breaker tests
```
