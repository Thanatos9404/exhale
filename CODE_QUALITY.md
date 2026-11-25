# Code quality

How Exhale keeps its code small, typed and layered. Every rule on this page is enforced by `npm run check` and by CI, not by review.

## Layers

The layer rules are tests in [tests/architecture.test.ts](tests/architecture.test.ts). They read every import of every production module under `src`, `server`, `api` and `scripts` and fail the build on a forbidden one. The last column quotes the test name.

| Layer                     | Folder                                              | May import                                              | Must never import                                                                                                                                                        | Rule asserted                                                   |
| ------------------------- | --------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Engine and shared logic   | `src/lib/`                                          | Other `src/lib` modules and non-UI packages such as zod | `src/components`, `src/pages`, `src/state`, `src/hooks`, UI packages (React, Motion, GSAP, three.js, cmdk, Sonner, wouter, lucide-react), the AI SDKs, `server/`, `api/` | "src/lib is pure logic: no UI code, no UI packages, no AI SDKs" |
| Base of the engine        | `src/lib/science`, `src/lib/air`, `src/lib/profile` | Each other and shared helpers                           | `src/lib/planner`                                                                                                                                                        | "has no import cycles between the layers of src/lib"            |
| Server                    | `server/`                                           | `src/lib`, the AI SDKs                                  | The UI folders, UI packages, `api/`                                                                                                                                      | "server is framework-free: it uses src/lib and never the UI"    |
| API handlers              | `api/`                                              | `server/`, `src/lib`                                    | The UI folders, UI packages, the AI SDKs                                                                                                                                 | "api handlers are thin: they call server and src/lib only"      |
| State and hooks           | `src/state/`, `src/hooks/`                          | `src/lib`, each other                                   | `src/components`, `src/pages`                                                                                                                                            | "state and hooks sit below components and pages"                |
| Shared components         | `src/components/`                                   | State, hooks, `src/lib`                                 | `src/pages`                                                                                                                                                              | "shared components never import pages"                          |
| Pages                     | `src/pages/`                                        | Components, state, hooks, `src/lib`, their own folder   | Another page's folder                                                                                                                                                    | "keeps each page folder private to its own page"                |
| Everything in the browser | `src/`                                              | As above                                                | `server/`, `api/`, the AI SDKs                                                                                                                                           | "the browser never imports server code or AI SDKs"              |

The AI SDKs are `@google/genai` and `@anthropic-ai/sdk`. Only `server/` may import them, so an API key can never be pulled into the browser bundle by an import.

## Limits enforced by lint

`npm run lint` runs `eslint . --max-warnings 0` with [eslint.config.js](eslint.config.js). A warning fails the build the same way an error does. [tests/docs.test.ts](tests/docs.test.ts) reads the five numbers below out of the config and fails if this table disagrees.

| Rule                     | Limit                                                        | What it keeps true                                     |
| ------------------------ | ------------------------------------------------------------ | ------------------------------------------------------ |
| `max-lines`              | 200 lines per file, not counting blank lines and comments    | A module can be read in one sitting                    |
| `max-lines-per-function` | 60 lines per function, not counting blank lines and comments | A function fits on one screen                          |
| `max-params`             | 4 parameters per function                                    | Anything wider takes one options object                |
| `max-depth`              | 3 levels of nested blocks                                    | Deeper logic becomes a named helper or an early return |
| `complexity`             | 12 as the highest cyclomatic complexity of a function        | Every function has few paths to test                   |

The same five limits apply to the build scripts in `scripts/`. Test files are exempt from the two line limits, as the next section says.

Other rules, all set to `error`:

| Rule                                                                           | What it enforces                                                                                                                                |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-nested-ternary`                                                            | No ternary inside a ternary                                                                                                                     |
| `@typescript-eslint/consistent-type-assertions` with `assertionStyle: 'never'` | No type assertions. Values are narrowed by a guard or a zod schema. `as const` stays allowed                                                    |
| `linterOptions.noInlineConfig` and `reportUnusedDisableDirectives`             | A rule cannot be switched off from inside a file. `eslint-disable` comments have no effect                                                      |
| `no-console`                                                                   | The console is used only in [server/log.ts](server/log.ts), the one file with an exemption                                                      |
| `no-warning-comments`                                                          | No leftover work markers in comments                                                                                                            |
| `@typescript-eslint/consistent-type-imports`                                   | Types are imported with `import type`                                                                                                           |
| `react-hooks/exhaustive-deps`                                                  | Hook dependency lists are complete. The preset ships this as a warning; here it is an error                                                     |
| `eqeqeq` (`smart`)                                                             | Strict equality, except the `== null` check                                                                                                     |
| `typescript-eslint` `strictTypeChecked`                                        | The strict type-aware set: no `any`, no non-null assertions, no unsafe member access, no floating promises                                      |
| `typescript-eslint` `stylisticTypeChecked`                                     | The type-aware style set                                                                                                                        |
| `eslint-plugin-react-hooks` `flat.recommended`                                 | The rules of hooks and, in the installed version 7, the React Compiler rules such as `purity`, `refs`, `immutability` and `set-state-in-effect` |
| `eslint-plugin-jsx-a11y` `recommended`                                         | Accessibility rules for JSX: labels, roles, alt text, keyboard handlers                                                                         |

### What is relaxed, and where

These are the places where the config relaxes a rule.

| Where                                                                            | What is relaxed                                                                                                                                                                                | Why                                                                                                                                                                                         |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test code: `*.test.ts`, `*.test.tsx`, `*.spec.ts`, `src/test/`, `tests/`, `e2e/` | `max-lines`, `max-lines-per-function`, `consistent-type-assertions`, `no-non-null-assertion`, `no-explicit-any`, the four `no-unsafe-*` rules, `no-empty-function` and `require-await` are off | Tests build fake clients and partial fixtures, and a test file lists many cases. `max-params`, `max-depth`, `complexity`, `no-console` and the ban on inline disabling still apply to tests |
| All TypeScript                                                                   | Three options of the strict set are loosened: unused names may start with `_`, numbers are allowed in template strings, and an arrow function may return a void call                           | These are deliberate style choices, set once in the config                                                                                                                                  |
| [server/log.ts](server/log.ts)                                                   | `no-console` is off                                                                                                                                                                            | It is the logger                                                                                                                                                                            |
| Plain JavaScript: `eslint.config.js` and `scripts/*.mjs`                         | The typescript-eslint, React and jsx-a11y sets do not run. These files get the ESLint recommended set, and the build scripts also get the five limits and `no-nested-ternary`                  | They have no types to check, and a build script reports to the terminal                                                                                                                     |

So "no `any`", "no type assertions" and "no non-null assertions" are statements about production code. Test code may use all three.

## TypeScript

Two projects are checked by `npm run typecheck` (`tsc -b`): [tsconfig.app.json](tsconfig.app.json) covers `src`, and [tsconfig.node.json](tsconfig.node.json) covers `server`, `api`, `scripts`, `tests`, `e2e` and the config files.

| Flag                                   | App     | Node    | Effect                                                                                                                 |
| -------------------------------------- | ------- | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| `strict`                               | on      | on      | Null checks, no implicit `any`, strict function types                                                                  |
| `noUncheckedIndexedAccess`             | on      | on      | `array[i]` is `T \| undefined` until checked                                                                           |
| `noUnusedLocals`, `noUnusedParameters` | on      | on      | Dead names fail the build                                                                                              |
| `verbatimModuleSyntax`                 | on      | on      | Type imports are erased exactly as written                                                                             |
| `isolatedModules`                      | on      | on      | Every file compiles on its own                                                                                         |
| `noFallthroughCasesInSwitch`           | on      | not set | A `case` cannot fall into the next one                                                                                 |
| `exactOptionalPropertyTypes`           | `false` | not set | Written out as `false` in the app config, so it is listed here: an optional property may still be assigned `undefined` |

## Conventions enforced by tests

Some rules cannot be written as lint rules. [tests/conventions.test.ts](tests/conventions.test.ts) checks them against the real files under `src`, `server`, `api` and `scripts`, and against [vercel.json](vercel.json).

| Convention                                                                                                                                                                                          | Why it matters                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| No Google, Anthropic or GitHub key pattern and no PEM private key, in source or in tests                                                                                                            | A secret in the repository is public the moment it is pushed             |
| No module under `src/` reads an environment variable, apart from Vite's own `DEV`, `PROD`, `MODE` and `BASE_URL`                                                                                    | Secrets stay on the server and cannot be bundled for the browser         |
| No `dangerouslySetInnerHTML`, `innerHTML` assignment, `eval` or `new Function` in production code                                                                                                   | Model output and user text can never run as markup or code               |
| The console is written to only by [server/log.ts](server/log.ts) (build scripts excepted)                                                                                                           | Every log line passes through the one place that masks keys              |
| No `eslint-disable`, `@ts-ignore`, `@ts-expect-error` or `@ts-nocheck` in production code                                                                                                           | A rule is fixed in the code, never silenced                              |
| No `any` type in production code                                                                                                                                                                    | Types describe the data all the way through                              |
| No unfinished-work markers, in source or in tests                                                                                                                                                   | Nothing is left half done                                                |
| Every production TypeScript module has at least one doc comment                                                                                                                                     | Exported names carry their own explanation                               |
| Every production module opens with a doc comment that states its one job                                                                                                                            | A reader learns what a file is for from its first lines                  |
| No production module is longer than 250 lines in total, comments and blank lines included                                                                                                           | A hard ceiling on top of the 200 counted lines that lint allows          |
| `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` and the two `Cross-Origin` policies have their exact values on every route, and `Permissions-Policy` turns the camera off            | The headers in [SECURITY.md](SECURITY.md) cannot be weakened by accident |
| HSTS lasts at least a year and includes subdomains                                                                                                                                                  | Browsers refuse plain HTTP                                               |
| The Content-Security-Policy has `default-src 'self'`, and `script-src` is `'self'` plus the two reCAPTCHA paths App Check needs, with no `unsafe-inline` or `unsafe-eval`                           | No inline script and no script from another origin                       |
| The policy blocks framing, plugins, base-tag hijacking and foreign form targets, and upgrades insecure requests                                                                                     | Common injection and clickjacking routes are closed                      |
| `connect-src` names only this origin, the Open-Meteo and BigDataCloud hosts, and the documented Firebase AI Logic, App Check and reCAPTCHA endpoints, over HTTPS; `frame-src` allows only reCAPTCHA | The browser can talk to the data APIs and nothing else                   |
| There is exactly one rewrite, to the app shell, and it does not match `/api/plan` or a missing file under `/assets/`                                                                                | A missing chunk is a real 404, never the app shell cached as JavaScript  |
| Hashed assets are cached for a year as `immutable`                                                                                                                                                  | Repeat visits download only what changed                                 |
| Every folder in `src/lib` has at least one test file                                                                                                                                                | No part of the engine is untested by omission                            |

## Design choices mapped to files

| Principle                                                 | How it is applied                                                                                                                                                                                                                                                                                              | Files                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One builder per kind of recommendation, behind a registry | Each builder is a function from the plan context to a proposal or `null`. The registry lists the twelve builders in a fixed order and is the single gate every proposal passes through. Adding advice means adding a builder and one line                                                                      | [src/lib/planner/actions/](src/lib/planner/actions/), [src/lib/planner/actions/registry.ts](src/lib/planner/actions/registry.ts), [src/lib/planner/context.ts](src/lib/planner/context.ts)                                                                                                                                                                                                   |
| Provider interfaces that tests can replace                | `GenAiLike` and `ClaudeLike` name the two SDK methods each client uses. Tests pass a fake that satisfies the interface, so key rotation, hedging, the Claude fallback and the provider order are tested with no network. The air client takes its `fetch` as a parameter and the deadline takes its clock      | [server/gemini/candidates.ts](server/gemini/candidates.ts), [server/claude.ts](server/claude.ts), [src/lib/air/openMeteo.ts](src/lib/air/openMeteo.ts), [server/deadline.ts](server/deadline.ts), [server/providers.test.ts](server/providers.test.ts), [server/server.test.ts](server/server.test.ts)                                                                                       |
| One logger                                                | Two functions, `warn` and `error`. They accept a message and one string or number, never an object, and mask anything shaped like an API key                                                                                                                                                                   | [server/log.ts](server/log.ts), [server/log.test.ts](server/log.test.ts)                                                                                                                                                                                                                                                                                                                     |
| Data is parsed with zod where it enters                   | Request bodies, AI output from both providers, values read back from local storage, Open-Meteo and BigDataCloud responses, and the API's own JSON responses in the browser are each parsed against a schema before use. The stored theme is a plain string and is checked against its three values without zod | [server/schemas.ts](server/schemas.ts), [src/lib/profile/schema.ts](src/lib/profile/schema.ts), [src/lib/apiTypes.ts](src/lib/apiTypes.ts), [src/lib/planner/planSchema.ts](src/lib/planner/planSchema.ts), [src/lib/storage.ts](src/lib/storage.ts), [src/lib/air/openMeteoSchemas.ts](src/lib/air/openMeteoSchemas.ts), [src/lib/geo.ts](src/lib/geo.ts), [src/lib/api.ts](src/lib/api.ts) |
| One pure engine, shared by the browser and the server     | `buildPlan` has no I/O and no UI imports. The browser calls it for instant what-if results; the API calls the same function, so the server's numbers are the numbers the user saw                                                                                                                              | [src/lib/planner/engine.ts](src/lib/planner/engine.ts), [src/hooks/useAir.ts](src/hooks/useAir.ts), [api/plan.ts](api/plan.ts), [api/chat.ts](api/chat.ts)                                                                                                                                                                                                                                   |
| `defined()` for invariants                                | Lint bans the `!` non-null assertion in production code. Where a value is guaranteed by construction, `defined(value, 'what')` narrows it and throws a named error if the guarantee is ever broken                                                                                                             | [src/lib/assert.ts](src/lib/assert.ts), used in [server/gemini/hedged.ts](server/gemini/hedged.ts) and [src/lib/planner/totals.ts](src/lib/planner/totals.ts)                                                                                                                                                                                                                                |
| Named constants with a reason                             | Every timeout, round count and cooldown in these two files is an exported constant with a comment that says why it has that value                                                                                                                                                                              | [server/gemini/config.ts](server/gemini/config.ts), [server/deadline.ts](server/deadline.ts)                                                                                                                                                                                                                                                                                                 |
| One deadline per request                                  | A handler starts one 50 second deadline and passes it to every stage. Each stage gets its own budget or the time left, whichever is smaller, so the stages cannot add up past the 60 second function limit                                                                                                     | [server/deadline.ts](server/deadline.ts), [server/request.ts](server/request.ts), [api/plan.ts](api/plan.ts), [api/chat.ts](api/chat.ts), [server/deadline.test.ts](server/deadline.test.ts), [api/handlers.test.ts](api/handlers.test.ts)                                                                                                                                                   |

The reasons behind these choices, with the alternatives that were rejected, are in [docs/DECISIONS.md](docs/DECISIONS.md). The layers and the request flow are drawn in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Module statistics

A snapshot taken on 24 November 2026. These numbers move with every change; the limits above are what holds them down.

| Measure                        | Value                                                             |
| ------------------------------ | ----------------------------------------------------------------- |
| Production modules             | 206 (173 in `src`, 28 in `server`, 3 in `api`, 2 in `scripts`)    |
| Median production module       | 74 lines                                                          |
| Largest production module      | 236 lines, [src/lib/profile/schema.ts](src/lib/profile/schema.ts) |
| Test files                     | 96: 84 Vitest files and 12 Playwright specs                       |
| Test lines per production line | 1.03 (18,108 to 17,571)                                           |

How they were counted, with a throwaway Node script that is not part of the repository:

- A production module is a `.ts`, `.tsx` or `.mjs` file under `src`, `server`, `api` or `scripts` that is not a test. This is the same file list [tests/sourceTree.ts](tests/sourceTree.ts) gives the architecture and convention tests.
- Test code is every `*.test.ts` and `*.test.tsx` file, everything in `src/test/`, `tests/` and `e2e/`. The count of 88 test files leaves out the 10 fixture and helper files; the line ratio includes them.
- Lines are raw lines, comments and blank lines included, counted as `text.split('\n').length`. That is how the 250-line convention test counts, and it is one more than `wc -l` reports for a file that ends with a newline.
- The largest module is over 200 raw lines and still passes `max-lines`, because that rule skips comments and blank lines.

## Docs kept true

A document is evidence only while it matches the code. Two test files make stale documentation fail the build.

| Test                                                       | What fails it                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [tests/docs.test.ts](tests/docs.test.ts)                   | One of the six criterion documents is missing (`CODE_QUALITY.md`, `SECURITY.md`, `EFFICIENCY.md`, `TESTING.md`, `ACCESSIBILITY.md`, `PROBLEM_ALIGNMENT.md`)                                                                                                                                   |
| [tests/docs.test.ts](tests/docs.test.ts)                   | Any Markdown file in the repository root or in `docs/` links to a local file that does not exist                                                                                                                                                                                              |
| [tests/docs.test.ts](tests/docs.test.ts)                   | The lint limits on this page differ from [eslint.config.js](eslint.config.js), the bundle budgets in [EFFICIENCY.md](EFFICIENCY.md) differ from [scripts/check-bundle.mjs](scripts/check-bundle.mjs), or the coverage thresholds in `TESTING.md` differ from [vite.config.ts](vite.config.ts) |
| [tests/workedExample.test.ts](tests/workedExample.test.ts) | The worked example in [PROBLEM_ALIGNMENT.md](PROBLEM_ALIGNMENT.md) no longer matches what the engine computes for the fixture day: the doses, the percentage cut, the cigarette equivalents, the CO2e saved, the wording of each change, or the headline                                      |

## Tooling

| Tool                       | What it does                                                                                                                                  | Configured in                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Prettier                   | One format for every file: 100 columns, single quotes, semicolons, trailing commas. `npm run format:check` fails on any unformatted file      | [.prettierrc.json](.prettierrc.json), [.prettierignore](.prettierignore)           |
| EditorConfig               | UTF-8, LF line endings, two-space indent and a final newline in every editor                                                                  | [.editorconfig](.editorconfig), [.gitattributes](.gitattributes)                   |
| `.nvmrc`                   | Pins Node 22 for local work. CI reads the same file                                                                                           | [.nvmrc](.nvmrc), [.github/workflows/ci.yml](.github/workflows/ci.yml)             |
| Vitest coverage thresholds | The build fails below 90% statements, 85% branches, 90% functions or 90% lines across `src/lib`, `server` and `api`                           | [vite.config.ts](vite.config.ts)                                                   |
| Bundle budget              | `npm run bundle:check` fails the build when the first load, the stylesheet or a route chunk outgrows its budget                               | [scripts/check-bundle.mjs](scripts/check-bundle.mjs)                               |
| Dependency audit           | `npm run audit:deps` fails CI on any high or critical advisory                                                                                | [package.json](package.json)                                                       |
| Dependabot                 | Weekly npm updates, with the React, three.js and lint packages grouped, and monthly updates for GitHub Actions                                | [.github/dependabot.yml](.github/dependabot.yml)                                   |
| CodeQL                     | The `security-extended` queries on every push to `main`, every pull request and once a week                                                   | [.github/workflows/codeql.yml](.github/workflows/codeql.yml)                       |
| Dependency review          | Fails a pull request that adds a dependency with a high or critical advisory                                                                  | [.github/workflows/dependency-review.yml](.github/workflows/dependency-review.yml) |
| Pinned actions             | Every `uses:` line in the three workflows names a full commit SHA, with the version in a comment. Every workflow starts from `contents: read` | [.github/workflows/](.github/workflows/)                                           |

CI runs two jobs on every push to `main` and every pull request. The `check` job runs the dependency audit, Prettier, `tsc`, ESLint, Vitest with coverage, a production build and the bundle budget. The `e2e` job runs the Playwright journeys in Chrome at a desktop and a phone size, with the network mocked.

## How to verify

```bash
npm ci
npm run check          # Prettier, tsc, ESLint with zero warnings, Vitest with coverage thresholds
npm run build          # tsc and the production build
npm run bundle:check   # bundle budget, run after the build
npm run audit:deps     # fails on high or critical advisories
npm run test:e2e       # Playwright journeys; needs Google Chrome installed
```

To run only the checks this page describes:

```bash
npm run lint                                   # limits and rules
npm run typecheck                              # both TypeScript projects
npx vitest run tests/architecture.test.ts      # layer boundaries
npx vitest run tests/conventions.test.ts       # conventions
npx vitest run tests/docs.test.ts tests/workedExample.test.ts   # documents match the code
```
