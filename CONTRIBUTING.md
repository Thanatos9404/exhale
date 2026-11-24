# Contributing to Exhale

Thanks for helping. This guide covers the workflow and the standards every change is held to. The standards are enforced by tools; [CODE_QUALITY.md](CODE_QUALITY.md) lists each rule and the file that enforces it.

## Setup

```bash
nvm use            # Node 22, from .nvmrc
npm ci
cp .env.example .env.local   # keys are optional; the app runs without them
npm run dev
```

## Before you open a pull request

Run the local gate first. CI runs the same four steps and then the rest of the table.

```bash
npm run check   # Prettier, tsc, ESLint (zero warnings), Vitest with coverage thresholds
```

| Gate               | Command                                                         | What fails it                                                                                                                                                                         |
| ------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Format             | `npm run format:check`                                          | Any file Prettier would change                                                                                                                                                        |
| Types              | `npm run typecheck`                                             | A type error in either TypeScript project                                                                                                                                             |
| Lint               | `npm run lint`                                                  | Any ESLint error or warning                                                                                                                                                           |
| Tests and coverage | `npm run test:coverage`                                         | A failing test, or coverage of `src/lib`, `server` and `api` below 90% statements, 85% branches, 90% functions or 90% lines                                                           |
| Architecture tests | `npx vitest run tests/architecture.test.ts`                     | An import that crosses a layer the wrong way                                                                                                                                          |
| Convention tests   | `npx vitest run tests/conventions.test.ts`                      | A secret, a console call outside the logger, an `any`, a silenced rule, a module without a header comment or over 250 lines, a weakened security header                               |
| Contrast test      | `npx vitest run tests/contrast.test.ts`                         | A colour token pair below 4.5:1 for text or 3:1 for control boundaries, in either theme                                                                                               |
| Docs tests         | `npx vitest run tests/docs.test.ts tests/workedExample.test.ts` | A broken link in a Markdown file, or a number in a document that no longer matches the code                                                                                           |
| Bundle budget      | `npm run build && npm run bundle:check`                         | First-load JavaScript over 170 kB gzip, the stylesheet over 15 kB, a route chunk over 25 kB, or a lazy-only chunk (`three`, `gsap`, `markdown`, `motion`, `ui`) loaded on first paint |
| Dependency audit   | `npm run audit:deps`                                            | A high or critical advisory in a dependency                                                                                                                                           |
| End-to-end suite   | `npm run test:e2e`                                              | A failing Playwright journey, in Chrome at a desktop and a phone size. The network is mocked. Needs Google Chrome installed                                                           |

The four test rows in the middle are part of `npm run test:coverage`, so `npm run check` already runs them. The last three rows run only when you run them, and in CI.

## Standards

**TypeScript**

- Strict mode with `noUncheckedIndexedAccess`.
- In production code: no `any`, no type assertions, no non-null assertions and no `@ts-ignore`. Test files may use them.
- When a value is guaranteed by construction, use `defined()` from [src/lib/assert.ts](src/lib/assert.ts), which fails loudly instead of hiding a bug.

**Linting**

- typescript-eslint `strictTypeChecked` and `stylisticTypeChecked`, the react-hooks recommended set with its React Compiler rules, and jsx-a11y.
- A file has at most 200 lines of code (comments and blank lines not counted) and 250 lines in total. A function has at most 60 lines, 4 parameters, complexity 12 and nesting depth 3.
- `eslint-disable` comments have no effect: inline configuration is switched off. Fix the code instead.
- The console is used only in [server/log.ts](server/log.ts). Server code logs through it.

**Formatting**

- Prettier: 100 columns, single quotes, trailing commas.
- `.editorconfig` keeps editors in line.

**Structure**

- Pure logic lives in `src/lib` and imports no React, no UI package and no AI SDK.
- Pages compose small components from their own folder (for example `src/pages/settings/`) and never import another page's folder.
- Shared UI lives in `src/components` and never imports a page.
- Server code in `server/` is framework-free; the thin handlers in `api/` only parse, call and respond.
- Every module opens with a doc comment that says what it is for.
- The layers are drawn in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

**Science**

- Every coefficient cites its source in a comment: US EPA, CPCB, WHO, Berkeley Earth, or the EPA Exposure Factors Handbook.
- Numbers shown in the UI come from the tested engine, never from the model.
- A new recommendation is a new builder in `src/lib/planner/actions/` and one line in [registry.ts](src/lib/planner/actions/registry.ts).

**AI output**

- Validate every model response with zod before use.
- Treat user text as data inside tagged blocks.
- Keep the Gemini, Claude Haiku and rules-engine fallback order intact.
- Pass the request deadline to every new stage, and give every new timeout a named constant with a reason.

**Accessibility**

- Charts need a text summary and a keyboard path.
- Motion respects `prefers-reduced-motion`.
- New pages get an entry in the page list of [src/pages/a11y.test.tsx](src/pages/a11y.test.tsx) and in the route table of [e2e/support/app.ts](e2e/support/app.ts), so axe checks them in jsdom and in Chrome.
- A new colour pairing gets a row in the table in [tests/contrast.test.ts](tests/contrast.test.ts).

**Tests**

- New logic ships with tests next to it (`*.test.ts`).
- API changes need handler tests covering invalid input and rate limits.
- User journeys live in `e2e/` and import `test` from [e2e/support/test.ts](e2e/support/test.ts), which fails a test that reaches the real network.

## Commits

Use short imperative subjects that say what changed for the user or the code ("Split the planner into action builders"). Keep each commit focused on one change.
