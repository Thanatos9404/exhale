# Architecture

Exhale turns live air data into a personalised daily routine. Two rules shape the design:

- A deterministic, tested engine computes every number.
- Generative AI only explains and tailors what the engine decided.

```
Browser (React SPA)                                Vercel Functions (fra1)
┌──────────────────────────────────────┐          ┌───────────────────────────────┐
│ pages/*  → components/*              │          │ api/plan.ts   api/chat.ts     │
│   ↑ state/ (household, deployments)  │  POST    │   ↓ zod, size cap, rate limit │
│   ↑ hooks/useAir (TanStack Query)    │ ───────▶ │ server/prompts → server/gemini│
│ lib/planner  (pure engine)           │          │   ↘ server/claude (fallback)  │
│ lib/science  (EPA, WHO, CPCB maths)  │          │   ↘ server/fallback (rules)   │
│ lib/air      (Open-Meteo, AQI)       │          │ lib/planner (same engine)     │
└──────────────────────────────────────┘          └───────────────────────────────┘
```

## Layers

| Layer   | Folder                           | Depends on  | Notes                                                                                                               |
| ------- | -------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------- |
| Science | `src/lib/science`, `src/lib/air` | nothing     | Pure functions with cited coefficients: AQI breakpoints, dose, indoor mass balance, commute exposure, mixing height |
| Planner | `src/lib/planner`                | science     | Pure TypeScript, deterministic, runs in a few milliseconds on both client and server                                |
| Server  | `server/`                        | lib         | Framework-free: prompts, provider clients, validation, rate limits, logging                                         |
| API     | `api/`                           | server, lib | Thin Vercel handlers: parse, call, respond                                                                          |
| State   | `src/state`, `src/hooks`         | lib         | Validated local storage, deployments, cached air data                                                               |
| UI      | `src/components`, `src/pages`    | state, lib  | Pages compose small components from their own folders                                                               |

## Planner pipeline (`src/lib/planner`)

1. `scenario.ts` turns the household into a baseline scenario: airing hour, exercise slots, commute mode and timing, N95, purifier, coil, incense, smoking, cooking and heating.
2. `memberDay.ts` lays out each member's fixed day: work or school hours, commute legs and exercise slot.
3. `simulator.ts` plays every member's 24 hours against the hourly forecast. For each hour it works out where the person is (home, work, school, in transit or exercising) and the PM2.5 there. It tallies the inhaled dose using breathing rates for that activity.
4. `actions/*` builders each propose one kind of change: lid timing, ventilation, exercise, commute, home sources, filtration, fuel.
   - Each proposal is scored by re-simulating the day with only that change, which gives its marginal impact.
   - `registry.ts` runs the builders in a fixed order, so output is stable.
5. `totals.ts` combines the selected changes, which respects the what-if `only` set, into household totals.
6. `summary.ts` writes the headline, risk level and windows.

## AI fallback chain (`server/`)

```
Gemini (keys × models, hedged after 7 s, 3 rounds, breaker + quota cooldown)
  └─ fails → Claude Haiku (structured JSON, per-minute budget)
        └─ fails → rules engine (the plan's own explanations, offline chat answers)
```

- Every provider response is validated with zod and merged by action id. A model can explain or add tips, but it can never change a number.
- `server/gemini/` holds the parts of the Gemini client:
  - `candidates` (key × model pairs)
  - `breaker` (cooldowns)
  - `hedged` (fan-out runner)
  - `json` (structured plans)
  - `stream` (chat with a first-token timeout and search-grounding fallback)

## Testing strategy

| Area                | What the tests cover                                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Science and planner | Unit tests on breakpoints and formulas; scenario tests for different households; determinism; the plan never makes a day worse          |
| Server              | Fake provider clients exercise hedging, retries, key rotation, the breaker, the Claude fallback, log masking, rate limits and body caps |
| API                 | Handlers tested with invalid input, prompt-injection attempts and 429s                                                                  |
| UI                  | Testing Library flows plus axe-core accessibility checks on the main pages                                                              |

CI enforces Prettier, `tsc`, strict type-checked ESLint (zero warnings), coverage thresholds and a production build.
