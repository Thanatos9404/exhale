# Testing

How Exhale is tested, what each layer proves, and where the evidence stops. Every claim below names the test file that backs it.

The tests cover the planning engine and its science, the server and its three API handlers, both AI providers, the pages and shared components, and twelve end-to-end specs in a real browser.

## The suite is hermetic

No test needs a network connection, a real AI model or an API key. The browser suite enforces this: a request that escapes the mocks fails the test. In Vitest it holds by construction, through the fakes and stubs below.

| Guarantee                                          | How it is enforced                                                                                                                                                                           | Where                                                                                                                                                          |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No real Gemini or Claude call                      | Provider code talks to small interfaces (`GenAiLike`, `ClaudeLike`). Tests pass in fake clients with `setClient`, `setClaude` or a `client` argument                                         | [server/gemini/candidates.ts](server/gemini/candidates.ts), [server/claude.ts](server/claude.ts), [server/providers.test.ts](server/providers.test.ts)         |
| No real HTTP in unit and API tests                 | `fetch` is injected as an argument or stubbed with `vi.stubGlobal`                                                                                                                           | [src/lib/air/openMeteo.test.ts](src/lib/air/openMeteo.test.ts), [src/lib/api.test.ts](src/lib/api.test.ts), [server/airCache.test.ts](server/airCache.test.ts) |
| No real HTTP in page tests                         | The air-data module is mocked and the global `fetch` answers `/api/*` from fixtures                                                                                                          | [src/pages/a11y.test.tsx](src/pages/a11y.test.tsx), [src/pages/pages.test.tsx](src/pages/pages.test.tsx)                                                       |
| No API keys picked up from the developer's machine | `loadServerEnv` returns early in test mode, so the server keys in `.env.local` are never copied into `process.env`                                                                           | [vite.config.ts](vite.config.ts)                                                                                                                               |
| No hardcoded keys in source or tests               | A convention test scans every source and test file for key-shaped strings                                                                                                                    | [tests/conventions.test.ts](tests/conventions.test.ts)                                                                                                         |
| No escaped request in the browser suite            | One route handler sees every request. Open-Meteo, BigDataCloud and `/api/*` are answered from fixtures. Anything else is aborted and recorded, and the test fails if the record is not empty | [e2e/support/mockNetwork.ts](e2e/support/mockNetwork.ts), [e2e/support/test.ts](e2e/support/test.ts)                                                           |
| A fixed clock in the browser suite                 | `page.clock.setFixedTime` pins "now" to the fixture hour. The browser runs in the `Asia/Kolkata` time zone                                                                                   | [e2e/support/test.ts](e2e/support/test.ts), [playwright.config.ts](playwright.config.ts)                                                                       |

The browser fixtures are built from the app's own planner and schemas, so a mocked response has the same shape as a real one ([e2e/support/fixtures.ts](e2e/support/fixtures.ts)).

## Layers

| Layer                        | Tool                                                | What it proves                                                                                                                                                                       | Example files                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit                         | Vitest                                              | Each formula, parser and helper returns the published or hand-computed value, including at the edges                                                                                 | [src/lib/air/aqi.test.ts](src/lib/air/aqi.test.ts), [src/lib/science/science.test.ts](src/lib/science/science.test.ts), [src/lib/planner/edgeCases.test.ts](src/lib/planner/edgeCases.test.ts), [src/lib/storage.test.ts](src/lib/storage.test.ts)                                                                                               |
| Property-based               | Vitest with fast-check                              | Invariants hold for generated inputs, not only for chosen examples                                                                                                                   | [src/lib/planner/engine.property.test.ts](src/lib/planner/engine.property.test.ts), [src/lib/air/aqi.property.test.ts](src/lib/air/aqi.property.test.ts), [server/rateLimit.property.test.ts](server/rateLimit.property.test.ts)                                                                                                                 |
| API handlers                 | Vitest, calling the handlers with `Request` objects | Status codes, headers, validation, rate limits, deadlines and caching of `/api/plan`, `/api/chat` and `/api/health`                                                                  | [api/handlers.test.ts](api/handlers.test.ts), [api/chatStream.test.ts](api/chatStream.test.ts), [server/api.test.ts](server/api.test.ts)                                                                                                                                                                                                         |
| AI providers                 | Vitest with fake clients                            | Key rotation, model fallback, hedging, the circuit breaker, call budgets, schema validation of model output, and the Gemini to Claude to rules order                                 | [server/providers.test.ts](server/providers.test.ts), [server/server.test.ts](server/server.test.ts), [server/claude.test.ts](server/claude.test.ts), [server/gemini/stream.test.ts](server/gemini/stream.test.ts), [server/gemini/breaker.test.ts](server/gemini/breaker.test.ts), [server/gemini/budget.test.ts](server/gemini/budget.test.ts) |
| UI components and pages      | Vitest, jsdom, Testing Library                      | Components and whole pages render from fixtures and respond to clicks and keys as a user would drive them                                                                            | [src/components/components.test.tsx](src/components/components.test.tsx), [src/pages/pages.test.tsx](src/pages/pages.test.tsx), [src/pages/routine/CommunityAdvisoryCard.test.tsx](src/pages/routine/CommunityAdvisoryCard.test.tsx), [src/pages/assistant/conversation.test.tsx](src/pages/assistant/conversation.test.tsx)                     |
| Accessibility in jsdom       | axe-core, Testing Library                           | Every route passes axe, has one `h1`, landmarks, named controls, a working skip link and keyboard access. Live regions announce progress                                             | [src/pages/a11y.test.tsx](src/pages/a11y.test.tsx), [src/components/ui/roving.test.tsx](src/components/ui/roving.test.tsx), [src/components/ui/targetSize.test.tsx](src/components/ui/targetSize.test.tsx)                                                                                                                                       |
| Accessibility in real Chrome | axe-core injected by Playwright                     | Every route passes axe in the dark and the light theme, with computed colours and real focus                                                                                         | [e2e/accessibility.spec.ts](e2e/accessibility.spec.ts), [e2e/support/axe.ts](e2e/support/axe.ts)                                                                                                                                                                                                                                                 |
| End-to-end journeys          | Playwright, installed Chrome, production build      | The journeys listed below work on a 1440 px desktop viewport and a 390 px phone viewport with touch                                                                                  | [e2e/routine-deploy.spec.ts](e2e/routine-deploy.spec.ts), [e2e/resilience.spec.ts](e2e/resilience.spec.ts), [playwright.config.ts](playwright.config.ts)                                                                                                                                                                                         |
| Architecture                 | Vitest reading the source tree                      | No module imports across a layer boundary: the engine has no UI, the browser has no server code or AI SDK, pages do not import each other                                            | [tests/architecture.test.ts](tests/architecture.test.ts), [tests/sourceTree.ts](tests/sourceTree.ts)                                                                                                                                                                                                                                             |
| Conventions                  | Vitest reading the source tree and `vercel.json`    | No secrets, no `eval` or raw HTML, no lint escape hatches, no `any`, a doc comment on every module, and each security header by value                                                | [tests/conventions.test.ts](tests/conventions.test.ts)                                                                                                                                                                                                                                                                                           |
| Contrast                     | Vitest, computed from the stylesheet                | Every token pairing in both themes reaches its WCAG minimum. See [ACCESSIBILITY.md](ACCESSIBILITY.md) for the ratios                                                                 | [tests/contrast.test.ts](tests/contrast.test.ts)                                                                                                                                                                                                                                                                                                 |
| Documentation                | Vitest reading the Markdown files                   | Every relative link points at a file that exists. Quoted lint limits, bundle budgets and coverage thresholds match the configuration. The worked example matches the engine's output | [tests/docs.test.ts](tests/docs.test.ts), [tests/workedExample.test.ts](tests/workedExample.test.ts)                                                                                                                                                                                                                                             |
| Performance budget           | Vitest                                              | A full household plan builds in under 15 ms on average, and an eight-person household in under 60 ms                                                                                 | [tests/performance.test.ts](tests/performance.test.ts)                                                                                                                                                                                                                                                                                           |
| Bundle budget                | Node script after the build                         | First-load JavaScript, the stylesheet and each route chunk stay under their gzip budgets, and three.js, GSAP and the Markdown renderer are not preloaded                             | [scripts/check-bundle.mjs](scripts/check-bundle.mjs), [EFFICIENCY.md](EFFICIENCY.md)                                                                                                                                                                                                                                                             |

## Coverage

Coverage is collected with V8 and gated in CI by `npm run test:coverage`. The thresholds live in [vite.config.ts](vite.config.ts), and [tests/docs.test.ts](tests/docs.test.ts) fails if this table quotes a different number.

| Metric     | Threshold enforced in CI | Last measured |
| ---------- | ------------------------ | ------------- |
| statements | 90%                      | 98.86%        |
| branches   | 85%                      | 96.30%        |
| functions  | 90%                      | 99.35%        |
| lines      | 90%                      | 99.66%        |

**How it was measured.** On 24 November 2026, with `npm run check`, which runs Prettier, `tsc`, ESLint and `vitest run --coverage` over the whole suite. All 1,338 tests passed and the command exited 0.

**Scope.** The gated figure covers `src/lib`, `server` and `api`, which hold the engine, the science, the validation and the AI plumbing. The UI under `src/components`, `src/pages`, `src/state` and `src/hooks` is exercised by the component, page and end-to-end tests above, but it is not part of the gated figure and no percentage is claimed for it.

## Invariants proven by property tests

Each line is a property that fast-check tries to break with generated inputs.

**The plan** ([src/lib/planner/engine.property.test.ts](src/lib/planner/engine.property.test.ts))

- The same household and air data always give the same plan, and neither input is modified.
- Every number in a plan is finite, and no dose, cigarette count, budget, limit or AQI is negative, whatever gaps the forecast has.
- Every member appears once, in household order, and the totals add up.
- No action claims to save more than the affected members inhale.
- A dirtier forecast never lowers a baseline dose.
- The plan never raises any member above their baseline dose. This holds for the full plan and for any subset of free actions.
- Every listed saving in dose, cigarettes and CO2e is at least zero.
- With no action selected, every member sits exactly at baseline.
- One action selected alone saves exactly what that action reports.
- Deselecting any single recommended action never makes the day better.
- Every plan the engine builds still passes the response schema after a trip through JSON.

**The air-quality index** ([src/lib/air/aqi.property.test.ts](src/lib/air/aqi.property.test.ts))

- A sub-index never falls as the concentration rises, in every table of both standards (US EPA and India NAQI).
- A sub-index is a whole number inside the index range of its band, for any input.
- The AQI stays between 0 and 500, equals the worst sub-index and names the pollutant that set it.
- The AQI never falls when one pollutant rises and the others stay put.
- The category never becomes milder as the AQI rises.

**Exposure and trips** ([src/lib/science/exposure.property.test.ts](src/lib/science/exposure.property.test.ts))

- Inhaled dose scales linearly with time, adds up over consecutive stretches and is never negative.
- Adding a health condition never lowers sensitivity.
- An N95 mask never increases exposure.
- A zero-distance trip costs nothing, and dirtier street air never lowers the dose.
- Commute modes are ranked best first, each at most once, and the current mode stays in the running while the trip is within its range.

**The indoor model** ([src/lib/science/indoor.property.test.ts](src/lib/science/indoor.property.test.ts))

- More clean air from a purifier never raises indoor PM2.5.
- A stronger indoor source, or dirtier outdoor air, never lowers indoor PM2.5.
- A closed home with no sources is cleaner than the street.
- Results stay finite and non-negative for extreme but valid rooms.

**Weather windows** ([src/lib/science/meteo.property.test.ts](src/lib/science/meteo.property.test.ts))

- The cleanest window fits inside the forecast slice and beats every other complete run of hours.
- The dirtiest window is never cleaner than the cleanest one.
- No hour is called a smog lid without a shallow boundary-layer reading.
- Dispersion is never rated worse when the air mixes higher or the wind picks up.

**The server** ([server/rateLimit.property.test.ts](server/rateLimit.property.test.ts), [server/claude.property.test.ts](server/claude.property.test.ts))

- The rate limiter never lets through more than its limit in any window, for arbitrary arrival times.
- It never blocks a request while the window has room, counts each client separately, and its retry hint is honest: waiting that long gets the next request through.
- The JSON Schema rewrite for Claude closes every object schema at any depth, changes nothing else and is idempotent.

## Failure paths that are tested

| Failure                              | Expected behaviour                                                                                                                                   | Tested in                                                                                                                                                                                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invalid request body                 | 400 with a JSON error and the security headers                                                                                                       | [server/api.test.ts](server/api.test.ts) ("malformed API bodies"), [src/lib/profile/schema.test.ts](src/lib/profile/schema.test.ts)                                                                                                         |
| Oversized body                       | 413, and a stream with no declared length is cut off at the cap                                                                                      | [server/http.test.ts](server/http.test.ts) ("readJson: body size"), [server/api.test.ts](server/api.test.ts)                                                                                                                                |
| Wrong content type                   | 415                                                                                                                                                  | [server/http.test.ts](server/http.test.ts) ("readJson: content type"), [server/api.test.ts](server/api.test.ts)                                                                                                                             |
| Cross-site request                   | 403 for another origin, a look-alike host or a cross-site `Sec-Fetch-Site`                                                                           | [api/handlers.test.ts](api/handlers.test.ts) ("cross-site POSTs"), [server/http.test.ts](server/http.test.ts) ("assertSameOrigin")                                                                                                          |
| Rate limit reached                   | 429 with a retry hint. A forged `x-forwarded-for` buys no extra quota                                                                                | [api/handlers.test.ts](api/handlers.test.ts), [server/api.test.ts](server/api.test.ts), [server/rateLimit.property.test.ts](server/rateLimit.property.test.ts)                                                                              |
| Provider overloaded                  | The next model or key is tried, then the chain is swept again after a backoff                                                                        | [server/server.test.ts](server/server.test.ts) ("gemini wrapper"), [server/gemini/stream.test.ts](server/gemini/stream.test.ts)                                                                                                             |
| Quota exhausted                      | The key and model pair is benched for longer and skipped. A search-grounding quota error answers without search                                      | [server/gemini/breaker.test.ts](server/gemini/breaker.test.ts), [server/gemini/stream.test.ts](server/gemini/stream.test.ts), [server/api.test.ts](server/api.test.ts)                                                                      |
| A slow chain hitting the deadline    | The handler answers from the rules engine inside one deadline, even when Gemini and Claude both hang                                                 | [api/handlers.test.ts](api/handlers.test.ts) ("one deadline per request"), [server/deadline.test.ts](server/deadline.test.ts), [server/gemini/budget.test.ts](server/gemini/budget.test.ts), [server/claude.test.ts](server/claude.test.ts) |
| Stream interrupted                   | A stream that breaks midway ends with a note and is never stitched to a second answer. A reader that leaves aborts the upstream call                 | [api/chatStream.test.ts](api/chatStream.test.ts), [server/gemini/stream.test.ts](server/gemini/stream.test.ts), [server/gemini/budget.test.ts](server/gemini/budget.test.ts)                                                                |
| Open-Meteo down                      | The server answers 502 without internal details and remembers the failure for 30 seconds. The browser shows an error card with a retry that recovers | [server/api.test.ts](server/api.test.ts), [server/airCache.test.ts](server/airCache.test.ts), [src/lib/air/openMeteo.test.ts](src/lib/air/openMeteo.test.ts), [e2e/resilience.spec.ts](e2e/resilience.spec.ts)                              |
| Malformed upstream JSON              | A response that is not JSON, or does not match the schema, is rejected as a provider error. A malformed weather feed does not take the air data down | [src/lib/air/openMeteo.test.ts](src/lib/air/openMeteo.test.ts)                                                                                                                                                                              |
| Corrupt local storage                | Corrupt JSON, a tampered value or blocked storage reads as "nothing stored". A profile with repairable faults is repaired, not discarded             | [src/lib/storage.test.ts](src/lib/storage.test.ts), [src/lib/profile/schema.test.ts](src/lib/profile/schema.test.ts)                                                                                                                        |
| Prompt-injection attempts            | A `</user>` breakout, an instruction in the place label or a member name, and a forged model turn all stay inside data tags                          | [server/promptInjection.test.ts](server/promptInjection.test.ts)                                                                                                                                                                            |
| A model returning invalid JSON       | Treated as no answer, never cached, and the next provider or the rules engine answers                                                                | [server/server.test.ts](server/server.test.ts), [server/providers.test.ts](server/providers.test.ts), [server/claude.test.ts](server/claude.test.ts), [server/planCache.test.ts](server/planCache.test.ts)                                  |
| A model returning unknown action ids | Ids the engine never produced are dropped before the response is built                                                                               | [server/api.test.ts](server/api.test.ts) ("merges Gemini explanations and drops ids the engine never produced")                                                                                                                             |
| Thin or missing forecast data        | The engine fails loudly on an empty series and still plans from a single hour or without the weather feed                                            | [src/lib/planner/edgeCases.test.ts](src/lib/planner/edgeCases.test.ts)                                                                                                                                                                      |

## End-to-end journeys

Each spec runs twice: in the `desktop-chrome` project (1440 by 900) and the `phone-chrome` project (390 by 844, touch). All specs run with reduced motion except the last, which turns animations on.

| Spec                                                     | What it asserts                                                                                                                                                                                                                                             |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [e2e/overview.spec.ts](e2e/overview.spec.ts)             | The live AQI, its category and the readings behind it render from the fixture feeds. The smog-lid headline leads. The routine preview expands. The hour slider and the hour strip change the readout                                                        |
| [e2e/navigation.spec.ts](e2e/navigation.spec.ts)         | Every tab and every direct link reaches its page with one `h1`, the right document title and the active tab marked. Back and forward work. An unknown route shows a not-found state with a way home                                                         |
| [e2e/command-menu.spec.ts](e2e/command-menu.spec.ts)     | Ctrl+K opens the menu. A city search switches the place and survives a reload. A city can be picked with the keyboard alone. An empty result says so. Escape closes it. It can jump to a page, hand a question to the assistant and use the device location |
| [e2e/routine-deploy.spec.ts](e2e/routine-deploy.spec.ts) | A deployment shows its build log, then the AI summary and a per-action explanation. A deployment survives a reload. A 500 shows the error state and a retry succeeds. A rules-engine answer shows the fallback notice. A Claude answer credits Claude       |
| [e2e/impact.spec.ts](e2e/impact.spec.ts)                 | Switching a change off recomputes the household totals to the engine's own figures. "Apply all" restores them. Switching everything off leaves nothing avoided                                                                                              |
| [e2e/indoor.spec.ts](e2e/indoor.spec.ts)                 | A purifier lowers indoor PM2.5 and reset restores it. A smoke source makes the room worse. A quick win applies in one click. Draught-proofing is a radio group that changes the readout                                                                     |
| [e2e/assistant.spec.ts](e2e/assistant.spec.ts)           | A question streams the mocked answer and renders its Markdown. Enter sends. The conversation survives a reload until it is cleared. A failed request shows the error and hands the question back                                                            |
| [e2e/settings.spec.ts](e2e/settings.spec.ts)             | A saved name persists across a reload. An invalid name shows an inline error tied to its field and blocks saving. People can be added and removed. The sample household can be restored                                                                     |
| [e2e/resilience.spec.ts](e2e/resilience.spec.ts)         | A failed air feed shows the error state on four pages and a retry recovers. Pages that do not need live air keep working. A failed weather feed still shows air quality                                                                                     |
| [e2e/accessibility.spec.ts](e2e/accessibility.spec.ts)   | axe finds no violations on all seven routes, the open command menu and a deployed routine, in both themes. The skip link, the tab bar and the theme switch work from the keyboard                                                                           |
| [e2e/responsive.spec.ts](e2e/responsive.spec.ts)         | Phone project only. No route scrolls sideways, at the top or at the footer. The primary action of each page is fully in view and works when tapped. The tab bar scrolls inside itself                                                                       |
| [e2e/motion.spec.ts](e2e/motion.spec.ts)                 | With animations on, a deployment still paces its log and finishes, a routine row opens and closes, tabs navigate and the scrubber responds                                                                                                                  |

After every test the shared fixture also fails the test if any request tried to reach the real network or the page threw an uncaught error ([e2e/support/test.ts](e2e/support/test.ts)).

## Counts

At the time of writing, 24 November 2026. Other work on the repository adds tests, so treat these as a snapshot and use the commands for the current numbers.

| Suite                        | Test files | Tests | Result of the last run                                               |
| ---------------------------- | ---------- | ----- | -------------------------------------------------------------------- |
| Vitest (`npm test`)          | 84         | 1,338 | All 1,338 passed                                                     |
| Playwright, `desktop-chrome` | 12         | 91    | 76 passed, 15 skipped (the phone-only checks in the responsive spec) |
| Playwright, `phone-chrome`   | 12         | 91    | All 91 passed                                                        |

The Playwright suite ran in 2.1 minutes against the production build, started by its own `webServer` command.

Six of the unit tests are regression tests for bugs that writing them uncovered, all fixed on 24 November 2026: unsaved settings surviving "Restore sample household", two people added in the same millisecond sharing an id, the Overview scrubber losing its "Now" label at the end of a forecast, indoor smoking missing from the Indoor lab, a missing PM2.5 reading shown as zero, and the seeded random generator leaving its range for unusual seeds.

```sh
npx vitest run                                      # prints "Test Files" and "Tests" totals
npx playwright test --list                          # prints "Total: N tests in M files"
npx playwright test --list --project=phone-chrome   # the same for one project
```

## Limits of this evidence

- **jsdom has no layout engine.** Component and page tests cannot see overflow, wrapping, stacking or real sizes. Layout is covered only by the Playwright suite, at two viewport sizes: 1440 by 900 and 390 by 844.
- **Target sizes in jsdom are read from class names**, not measured ([src/components/ui/targetSize.test.tsx](src/components/ui/targetSize.test.tsx)).
- **WebGL scenes are not rendered in jsdom.** The page tests see the text fallback or the static poster. In the Playwright suite the tests assert the page around the 3D views, not the pixels they draw.
- **No test calls the real Gemini or Claude APIs.** Provider behaviour is tested against fake clients written from the SDK interfaces. A change in a provider's real responses would not be caught here.
- **No test calls the real Open-Meteo or BigDataCloud APIs.** Their schemas are checked against fixtures.
- **Vitest has no network guard.** Only the Playwright suite fails a test on an unmocked request. A new unit test that forgot its stub would not be stopped by tooling.
- **No load testing.** Rate limits and call budgets are proven by property and unit tests, not under concurrent traffic.
- **One browser engine.** The end-to-end suite runs in Chrome only. Firefox and Safari are not automated.
- **No visual regression testing.** No screenshots are compared.
- **Coverage is gated for logic only.** See the scope note above.
- **Some property tests are slow.** The planner properties re-simulate a day many times per case. On a heavily loaded machine one of them can exceed the 20 second test timeout set in [vite.config.ts](vite.config.ts).

## Commands

| Command                 | What it runs                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `npm test`              | The whole Vitest suite once                                                                                               |
| `npm run test:coverage` | The Vitest suite with V8 coverage. Fails under the thresholds above                                                       |
| `npm run test:e2e`      | Builds the app, serves the production build and runs the Playwright suite in both projects. Needs Google Chrome installed |
| `npm run check`         | Format check, type check, lint with zero warnings, then `test:coverage`                                                   |
| `npm run bundle:check`  | The bundle budget. Run it after `npm run build`                                                                           |

CI runs the audit, format, type check, lint, coverage, build and bundle budget in one job, and the Playwright suite in a second job ([.github/workflows/ci.yml](.github/workflows/ci.yml)).
