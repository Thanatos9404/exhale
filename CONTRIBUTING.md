# Contributing to Exhale

Thanks for helping. This guide covers the workflow and the standards every change is held to.

## Setup

```bash
nvm use            # Node 22, from .nvmrc
npm ci
cp .env.example .env.local   # keys are optional; the app runs without them
npm run dev
```

## Before you open a pull request

Run the same gate CI runs:

```bash
npm run check   # Prettier, tsc, ESLint (zero warnings), Vitest with coverage thresholds
```

## Standards

**TypeScript**

- Strict mode with `noUncheckedIndexedAccess`.
- No `any`, no non-null assertions and no `@ts-ignore`.
- When a value is guaranteed by construction, use `defined()` from `src/lib/assert.ts`, which fails loudly instead of hiding a bug.

**Linting**

- typescript-eslint `strictTypeChecked` and `stylisticTypeChecked`.
- React Compiler hook rules and jsx-a11y.
- Files stay under 300 lines, functions under complexity 20 and nesting depth 4.
- Do not add `eslint-disable` comments. Fix the code instead.

**Formatting**

- Prettier: 100 columns, single quotes, trailing commas.
- `.editorconfig` keeps editors in line.

**Structure**

- Pure logic lives in `src/lib` and has no React imports.
- Pages compose small components from their own folder (for example `src/pages/settings/`).
- Shared UI lives in `src/components`.
- Server code in `server/` is framework-free; the thin handlers in `api/` only parse, call and respond.

**Science**

- Every coefficient cites its source in a comment: US EPA, CPCB, WHO, Berkeley Earth, or the EPA Exposure Factors Handbook.
- Numbers shown in the UI come from the tested engine, never from the model.

**AI output**

- Validate every model response with zod before use.
- Treat user text as data inside tagged blocks.
- Keep the Gemini, Claude Haiku and rules-engine fallback order intact.

**Accessibility**

- Charts need a text summary and a keyboard path.
- Motion respects `prefers-reduced-motion`.
- New pages get an axe check in `src/pages/pages.test.tsx`.

**Tests**

- New logic ships with tests next to it (`*.test.ts`).
- API changes need handler tests covering invalid input and rate limits.

## Commits

Use short imperative subjects that say what changed for the user or the code ("Split the planner into action builders"). Keep each commit focused on one change.
