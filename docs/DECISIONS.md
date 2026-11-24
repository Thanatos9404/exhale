# Decision record

The choices that shaped Exhale, each with the alternative that was rejected and what the choice cost. Newest last.

## 1. A deterministic engine decides; the model explains

- **Decision.** All health numbers (dose, limits, windows, savings) come from pure functions in `src/lib`. Gemini receives the finished plan and writes the wording.
- **Rejected.** Asking the model to produce the plan and its numbers directly.
- **Why.** A family acts on these numbers. They must be reproducible, unit-tested and identical on every run. A language model cannot promise that.
- **Cost.** More code: a simulator and one builder per kind of action. In return the app works with no AI key at all.

## 2. Score each action by re-simulating the day

- **Decision.** The planner applies one change to a copy of the baseline day, replays every member's 24 hours and takes the difference as that action's impact.
- **Rejected.** Fixed "typical savings" per tip.
- **Why.** The saving from moving a walk depends on today's forecast and on that person's sensitivity. Only a replay gets it right.
- **Cost.** One simulation per candidate action. At under 2 ms for the whole plan, including the do-no-harm checks, this is free in practice.

## 3. Model output is merged by id and can never change a number

- **Decision.** The model returns `{ id, why }` pairs in a JSON schema. The server validates them with zod, drops ids the engine did not produce and attaches the text to the engine's item.
- **Rejected.** Rendering the model's free text as the plan.
- **Why.** It makes prompt injection and hallucinated figures harmless: the worst a bad response can do is lose an explanation.

## 4. Three providers in a fixed order

- **Decision.** Gemini first, across several keys and models. Claude Haiku second. A rules engine last.
- **Rejected.** Gemini only, with an error state.
- **Why.** Winter smog mornings are exactly when free-tier capacity runs out. A health tool should degrade, not fail.
- **Cost.** A provider abstraction and a larger test surface, all covered with fake clients.

## 5. Hedged requests and a circuit breaker for Gemini

- **Decision.** If the first key and model pair is silent for 7 seconds, start the next one in parallel and take the first answer. Skip a pair that failed for 3 minutes, or 10 when its quota is spent.
- **Rejected.** Sequential retries with backoff.
- **Why.** Overload errors arrive slowly. Waiting for each timeout in turn would exceed the 60 second function limit.

## 6. Household data stays in the browser

- **Decision.** The profile, chat and saved plans live in local storage, validated when read. The server is stateless.
- **Rejected.** Accounts and a database.
- **Why.** Health conditions of children and grandparents are sensitive. Not collecting them is the strongest privacy control, and it removes a whole class of security work.
- **Cost.** No sync between devices.

## 7. India NAQI and US EPA, selectable

- **Decision.** Both AQI standards are implemented from their published breakpoints, and the household picks one.
- **Why.** The persona lives in India and reads NAQI numbers in the news, while most reference material quotes the EPA scale. Showing the wrong scale would undermine trust.

## 8. Thin API handlers on the Web Request and Response types

- **Decision.** Each file in `api/` parses, validates, calls `server/` and responds. Handlers use the standard `Request` and `Response` objects.
- **Why.** Handlers can be unit-tested by calling them with a `Request`, with no HTTP server, and the same code runs under the Vite dev server and on Vercel.

## 9. The 3D scene is progressive enhancement

- **Decision.** three.js loads only when a 3D view mounts, behind a WebGL check, with the same facts in text beside it.
- **Rejected.** Making the 3D air column the only way to read the forecast.
- **Why.** It explains the smog lid better than a number, but it must never block first paint, exclude a screen-reader user or drain a phone.

## 10. Strict limits enforced by tools, not by review

- **Decision.** File, function, complexity and nesting limits, a ban on type assertions, layer boundaries and conventions are all enforced by ESLint and by tests in `tests/`, with no way to switch a rule off inside a file.
- **Rejected.** A style guide that relies on reviewers.
- **Why.** Rules that a machine checks stay true as the code changes. See [CODE_QUALITY.md](../CODE_QUALITY.md).
- **Cost.** Some refactors exist only to satisfy a limit. The limits were chosen so that those refactors also made the code easier to read.

## 11. Functions run in Frankfurt

- **Decision.** `vercel.json` pins the functions to `fra1`.
- **Rejected.** Mumbai, which is closer to the persona.
- **Why.** Measured Gemini availability was much steadier from Frankfurt during testing, and the extra round trip is small next to model latency.
