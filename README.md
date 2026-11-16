# InvestLab

A small loan investment dashboard and simulator. It is a portfolio sample, not a lending product.

The public site is a static demo: [https://artitudinale1.github.io/lendinvest-test/](https://artitudinale1.github.io/lendinvest-test/)

## Features

- Current Loans lists the three fixture loans, their available balances, and a derived total.
- A valid whole-pound investment reduces that loan’s balance and shows an invested badge.
- Investment Lab is a separate scenario. It takes a budget, allocates it across the same loans, and shows the remaining budget, each share, and an illustrative annual gross return.
- An accessible chart and table describe the allocation. The table footer share is the allocated total divided by the budget.
- Investment Copilot can explain the scenario, compare the supplied rates, preview an allocation change, or preview an equal split. Preview, Apply, and Dismiss keep the form unchanged until the user confirms.

## Tech stack

- React 19 and TypeScript
- Vite 8
- Tailwind CSS 4
- Vitest and Testing Library

There is no router, component library, or chart library. The local Copilot uses `fetch` against an OpenAI-compatible API. No AI SDK is installed.

## Architecture

Current Loans keeps its own React state. `invest()` in `src/loans.ts` is a pure function and returns a new loan list. Investment Lab does not call it and does not change those balances. Its calculations live in `src/lab.ts` and use integer pounds, basis points, and pence.

The Copilot has three separate steps:

1. The model may classify a question into a fixed intent. The server rejects anything that does not match that shape.
2. TypeScript validates the intent and calculates every amount, share, return, and proposed change.
3. The model may write a short explanation from those calculated facts. If that text contains a figure that is not in the facts, the screen keeps the facts and hides the explanation.

The screen renders financial figures from the TypeScript result. The browser repeats the same calculation from the validated intent, so a model-authored number cannot become an allocation.

`handleCopilotRequest` in `src/server/copilot.ts` does not depend on Vite. `src/server/viteAdapter.ts` exposes it at `POST /api/copilot` during `vite dev` and `vite preview`. The API key is read from the server environment. It is never given a `VITE_` name, so Vite does not put it in the browser bundle.

### Public demo

GitHub Pages is static, so the Pages build sets `VITE_COPILOT_DEMO=true`. In that build the Copilot does not call `/api/copilot`. The four example questions still run through the same calculations, and Preview, Apply, and Dismiss behave as they do locally. The panel states that the language model is unavailable. Any other question shows that the Copilot is unavailable. A local `npm run dev` leaves the flag unset and continues to use the local API.

## Testing

```sh
npm test
npm run build
```

The tests cover loan investment, the simulator’s rounding and validation, Copilot intent handling, the local request handler, and the public demo path. The production build typechecks the project and emits `dist/`.

## Local development

```sh
npm ci
npm run dev
```

Open [http://localhost:5173/lendinvest-test/](http://localhost:5173/lendinvest-test/). Vite is configured with that base path so local assets match GitHub Pages.

To try the live model locally, copy `.env.example` to `.env`, set `COPILOT_PROVIDER`, `COPILOT_API_KEY`, and `COPILOT_MODEL`, then restart the dev server. `.env` is gitignored. Leave `VITE_COPILOT_DEMO` unset.

`npm run preview` serves the production build and the same local API route.

## CI/CD and GitHub Pages

`.github/workflows/ci.yml` runs on pull requests and pushes. It installs with `npm ci`, then runs `npm test` and `npm run build`.

A second job deploys only after that job passes, and only for a push to the repository’s default branch. It rebuilds with `VITE_COPILOT_DEMO=true` and publishes `dist/` with the official GitHub Pages actions. The site is served at `/lendinvest-test/`.

In the repository settings, set Pages to deploy from GitHub Actions. The workflow requests the Pages deployment permissions itself. No API key belongs in the Pages environment: the public site does not call a model.

## AI-assisted development

Cursor was used to plan and implement the modernisation, the Investment Lab, the Copilot, and this deployment setup. The investment rules, fixture, and calculations remain explicit TypeScript, and the tests check those results directly.

## Financial simulation disclaimer

The balances, rates, and returns are fixture data for a technical demonstration. A return labelled here is an illustrative annual gross return based on the supplied annualised rate. It is not guaranteed, not a forecast, and not financial advice. The loan deadline is not treated as an investment term. Nothing in this application moves money or places an investment.
