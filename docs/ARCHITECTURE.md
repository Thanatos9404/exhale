# Architecture

Exhale turns live air data into a personalised daily routine. Two rules shape the design:

- A deterministic, tested engine computes every number.
- Generative AI only explains and tailors what the engine decided.

```
Browser (React SPA)                               Vercel Functions (fra1)
┌──────────────────────────────────────┐          ┌──────────────────────────────────────────────┐
│ pages/*  → components/*              │          │ api/plan.ts   api/chat.ts                    │
│   ↑ state/ (household, deployments)  │  POST    │   ↓ same-origin guard, rate limit            │
│   ↑ hooks/useAir (TanStack Query)    │ ───────▶ │   ↓ size cap, zod, one 50 s deadline         │
│ lib/planner   (pure engine)          │          │ server/planAi   server/chatAnswer            │
│ lib/science   (EPA, WHO, CPCB maths) │          │   → server/gemini (hedged, breaker, budget)  │
│ lib/air       (Open-Meteo, AQI)      │          │   ↘ server/claude (fallback)                 │
│ lib/profile   (household schema)     │          │   ↘ server/fallback (rules)                  │
│ lib/community (public bulletin)      │          │ lib/planner (same engine)                    │
└──────────────────────────────────────┘          └──────────────────────────────────────────────┘
```

- The browser reads Open-Meteo directly for the dashboard. The server fetches its own copy for a plan or an answer and never trusts readings posted by the browser ([server/airCache.ts](../server/airCache.ts)).
- `api/health.ts` answers `GET /api/health` with the configured providers. It is the only API response a CDN may cache.

## Layers

The "Depends on" column is what each layer imports. The boundaries are tests in [tests/architecture.test.ts](../tests/architecture.test.ts); [CODE_QUALITY.md](../CODE_QUALITY.md) lists what each layer may and may not import.

| Layer                 | Folder                                        | Depends on                        | Notes                                                                                                                                                                                                                                                                                                 |
| --------------------- | --------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Science               | `src/lib/science`                             | air types                         | Pure functions with cited coefficients: dose, indoor mass balance, commute exposure, mixing height                                                                                                                                                                                                    |
| Air data              | `src/lib/air`                                 | `assert.ts`                       | `aqiTables.ts` holds the US EPA and India NAQI breakpoints as data. `aqiCategories.ts` names the bands and their advice. `aqi.ts` interpolates and is the entry point for both. `openMeteo.ts` is the client, and `openMeteoSchemas.ts` holds the zod shapes every Open-Meteo response is parsed with |
| Profile               | `src/lib/profile`                             | zod only                          | One household schema validates local storage in the browser and request bodies on the server                                                                                                                                                                                                          |
| Planner               | `src/lib/planner`                             | science, air, profile             | Pure TypeScript and deterministic. The same code runs in the browser and on the server. `planSchema.ts` is the zod shape of a plan, used when one arrives over the network                                                                                                                            |
| Community             | `src/lib/community`                           | planner types, science, air types | The neighbourhood bulletin in English and Hindi. `advisory.ts` reads only the public facts of a plan, through a type with no members, items or doses. `messages.ts` holds the wording                                                                                                                 |
| Contracts and helpers | `src/lib/*.ts`                                | the folders above                 | `apiTypes.ts` (contracts shared by browser and server, with the schema for AI wording), `api.ts` (browser client that parses every JSON response), `storage.ts` (validated local storage), `assert.ts` (`defined()`), `geo.ts`, `format.ts`, `cn.ts`                                                  |
| Server                | `server/`                                     | `src/lib`                         | Framework-free: request gate, prompts, provider clients, validation, caches, rate limits, logging. The only layer that imports an AI SDK                                                                                                                                                              |
| API                   | `api/`                                        | `server`, `src/lib`               | Thin Vercel handlers on the Web `Request` and `Response` types: parse, call, respond                                                                                                                                                                                                                  |
| State and hooks       | `src/state`, `src/hooks`                      | `src/lib`                         | Validated local storage, deployments, cached air data                                                                                                                                                                                                                                                 |
| UI                    | `src/components`, `src/pages`                 | state, hooks, `src/lib`           | Pages compose small components from their own folders. Six pages, the command dialog, the toaster, the 3D views and the Markdown renderer are `lazy()` imports                                                                                                                                        |
| Build scripts         | `scripts/`                                    | nothing in the app                | `check-bundle.mjs` enforces the bundle budget. `devApiPlugin.ts` serves `api/` under the Vite dev server                                                                                                                                                                                              |
| Tests                 | `tests/`, `e2e/`, `*.test.ts` beside the code | everything                        | See [Testing strategy](#testing-strategy)                                                                                                                                                                                                                                                             |

## Server modules (`server/`)

| Module                          | Job                                                                                                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `request.ts`                    | The gate in front of every POST handler: `admit` runs the same-origin guard and the per-client rate limit, and `liveAir` fetches air data inside the request deadline |
| `origin.ts`                     | The same-origin guard                                                                                                                                                 |
| `clientKey.ts`                  | One rate-limit key per visitor, from the platform's forwarded address, with IPv6 collapsed to its /64                                                                 |
| `rateLimit.ts`, `boundedMap.ts` | Sliding-window limiter and the one eviction rule shared by every in-memory map                                                                                        |
| `http.ts`                       | JSON responses, client-safe errors and a body reader with a hard size cap                                                                                             |
| `schemas.ts`                    | zod schemas for request bodies and the JSON Schema the plan model answers in                                                                                          |
| `deadline.ts`, `abortable.ts`   | The request deadline, and abort helpers that stop waiting even if an SDK does not                                                                                     |
| `airCache.ts`                   | Air data per 1 km cell: 10 minutes for a reading, 30 seconds for a failure                                                                                            |
| `prompts.ts`, `chatPrompt.ts`   | Prompt construction. User text sits inside named data tags, and replayed chat history is sent as unverified data                                                      |
| `planAi.ts`, `planCache.ts`     | The provider chain for plan wording, behind a cache of validated answers keyed on a hash of the prompt                                                                |
| `chatAnswer.ts`                 | The provider chain for one chat answer. Every chunk names the provider that wrote it                                                                                  |
| `gemini.ts`, `gemini/`          | The Gemini client. Its parts are listed under [AI fallback chain](#ai-fallback-chain-server)                                                                          |
| `claude.ts`                     | Claude Haiku as the second provider, for JSON and for streams                                                                                                         |
| `fallback.ts`                   | Offline chat answers written from the engine's plan                                                                                                                   |
| `log.ts`                        | The one logger. It masks anything shaped like an API key                                                                                                              |

## One deadline per request

A handler starts one deadline when the request arrives and hands it to every stage. Each stage gets its own budget or the time left, whichever is smaller, so the stages cannot add up past the function limit.

```
request arrives
  │  startDeadline()  50 s, inside the 60 s function limit            server/deadline.ts
  ├─ admit            same-origin guard → 403, rate limit → 429       server/request.ts
  ├─ readJson         content type → 415, size cap → 413, zod → 400   server/http.ts, server/schemas.ts
  ├─ liveAir          min(11 s, time left), failure → 502             server/request.ts
  ├─ buildPlan        the engine, no I/O                              src/lib/planner/engine.ts
  ├─ Gemini           min(30 s, time left), skipped under 2 s         server/gemini/
  ├─ Claude Haiku     min(30 s, time left), skipped under 2 s         server/claude.ts
  └─ rules engine     needs no time, always answers                   server/fallback.ts
```

- `admit` runs before the body is read, so a refused request costs nothing.
- The air fetch stops itself after 10 seconds. The handler waits one second longer, so the fetch's own error arrives first.
- A chat with web search gives Gemini 16 seconds to start a grounded answer before it tries without search.
- The Gemini budgets are named constants with their reasons in [server/gemini/config.ts](../server/gemini/config.ts). The request deadline and the 2 second minimum are in [server/deadline.ts](../server/deadline.ts).
- [api/handlers.test.ts](../api/handlers.test.ts) ("one deadline per request") hangs the providers and checks that the handler still answers from the rules engine.

## Same-origin guard

Every POST spends AI quota, so another website must not be able to make a visitor's browser send one. The API has no CORS and no cookies. [server/origin.ts](../server/origin.ts) adds an explicit check:

- A request whose `Sec-Fetch-Site` header is anything but `same-origin` or `none` is refused with 403. `same-site` is refused too, because a sibling subdomain is a different origin.
- A request whose `Origin` header names a host other than the one the request was sent to is refused with 403.
- A request with neither header is not from a browser (curl, a server, a test) and is allowed.
- The body must be exactly `application/json`, or the answer is 415 ([server/http.ts](../server/http.ts)). A browser cannot send that type to another origin without a preflight.

## Planner pipeline (`src/lib/planner`)

`buildPlan` in `engine.ts` is the public entry point. It runs these steps in order.

1. `context.ts` builds the shared context once per plan: the simulator, the baseline day, its exposure, the cleanest hours and the smog-lid spans.
2. `scenario.ts` turns the household into a baseline scenario: airing hour, exercise slots, commute mode and timing, N95, purifier, coil, incense, smoking, cooking and heating.
3. `memberDay.ts` lays out each member's fixed day: work or school hours, commute legs and exercise slot.
4. `simulator.ts` plays every member's next 24 hours against the hourly forecast. For each hour it works out where the person is (home, work, school, in transit or exercising) and the PM2.5 there. It tallies the inhaled dose using breathing rates for that activity.
5. `actions/*` builders each propose one kind of change: smog lid and ventilation (`weather.ts`), exercise, commute mode and departure time, home sources, filtration, fuel.
   - A proposal is a free action, a paid upgrade or plain advice (`context.ts`).
   - Each one is scored by re-simulating the day with only that change, which gives its marginal impact (`impact.ts`).
6. `guard.ts` is the do-no-harm rule. A change that raises any member's dose or concentration-hours, or the household's CO2e, is refused. It judges the unrounded simulation, member by member.
7. `actions/registry.ts` runs the builders in a fixed order, drops every proposal the guard refuses, then settles the list (`combine.ts`) so that every listed action is really taken and removing any one of them never lowers the household's dose.
8. `combine.ts` stacks the selected free actions one at a time onto the baseline and skips a step that would harm anyone given the steps before it. The what-if `only` set selects which actions are stacked.
9. `totals.ts` produces per-member summaries, household totals and the order items are shown in.
10. `summary.ts` writes the current risk, the lid and window summaries and the headline.

`types.ts` holds the public shapes of a plan, and `format.ts` the rounding and hour labels every step shares. [tests/performance.test.ts](../tests/performance.test.ts) fails the build if a plan for the default household takes 15 ms or more on average.

## AI fallback chain (`server/`)

Plan wording ([server/planAi.ts](../server/planAi.ts)):

```
plan cache (same prompt answered in the last 10 minutes, validated answers only)
  └─ miss → Gemini (keys × models, hedged after 7 s, 3 rounds, breaker + quota cooldown, 60 calls a minute)
        └─ fails → Claude Haiku (structured JSON, no retries, 20 calls a minute)
              └─ fails → rules engine (the plan's own explanations)
```

Chat answers ([server/chatAnswer.ts](../server/chatAnswer.ts)):

```
Gemini with Google Search (only when the user asked for web search)
  └─ nothing written → Gemini without search (the answer opens with a note that search was unavailable)
        └─ nothing written → Claude Haiku (stream)
              └─ nothing written → rules engine (offline answer from the plan, server/fallback.ts)
```

- Every structured provider response is validated with zod and merged by action id. A model can explain or add tips, but it can never change a number.
- The first provider that writes anything answers the whole chat question. A stream moves to the next key and model pair only before its first token, so two half-answers are never joined. The `x-exhale-source` header names the provider that answered.
- Both call budgets are per server instance. When Gemini's is spent, the chain goes straight to Claude.
- `server/gemini/` holds the parts of the Gemini client:
  - `candidates` (key × model pairs, and the client interface that tests replace with a fake)
  - `breaker` (a failing pair is skipped for 3 minutes, a quota-spent pair for 10)
  - `budget` (60 upstream calls a minute per instance)
  - `hedged` (fan-out runner)
  - `json` (structured plans)
  - `stream` (chat with a first-token timeout of 8 seconds)
  - `sources` (the list of cited pages under a grounded answer: `https` links only, with link-breaking characters encoded)
  - `errors` (which failures are worth retrying on another pair)
  - `config` (every timeout and round count, each with its reason)

## Testing strategy

| Area                | Where                  | What the tests cover                                                                                                                                                                                                                 |
| ------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Science and planner | `src/lib/**/*.test.ts` | Unit tests on breakpoints and formulas; scenario tests for different households; property tests with fast-check; determinism; the plan never makes a day worse                                                                       |
| Server              | `server/**/*.test.ts`  | Fake provider clients exercise hedging, retries, key rotation, the breaker, the call budgets, the Claude fallback, the deadline, the plan cache, prompt-injection attempts, log masking, rate limits and body caps                   |
| API                 | `api/*.test.ts`        | Handlers tested with invalid input, cross-site POSTs, 429s, hung providers and a reader that disconnects mid-stream                                                                                                                  |
| UI                  | `src/**/*.test.tsx`    | Testing Library flows plus axe-core accessibility checks on every route                                                                                                                                                              |
| Repository rules    | `tests/`               | Layer boundaries (`architecture`), conventions and security headers (`conventions`), documents that match the code (`docs`, `workedExample`), the planner's time budget (`performance`), colour contrast of both themes (`contrast`) |
| End to end          | `e2e/`                 | Twelve Playwright specs against the production build in Chrome, at a desktop and a phone size. Every request that would leave the machine is answered from fixtures by `e2e/support/mockNetwork.ts`                                  |

CI enforces a dependency audit, Prettier, `tsc`, strict type-checked ESLint (zero warnings), coverage thresholds, a production build, the bundle budget and the end-to-end suite ([.github/workflows/ci.yml](../.github/workflows/ci.yml)).
