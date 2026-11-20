# InvestLab

A loan investment dashboard and simulator. It is a portfolio sample, not a lending product.

The public site is [https://artitudinale1.github.io/lendinvest-test/](https://artitudinale1.github.io/lendinvest-test/).

## Features

- Current Loans lists the three fixture loans, their available balances, and a derived total.
- A valid whole-pound investment reduces that loan’s balance and shows an invested badge.
- Investment Lab is a separate scenario. It takes a budget, allocates it across the same loans, and shows the remaining budget, each share, and an illustrative annual gross return.
- An accessible chart and table describe the allocation.
- Investment Copilot can explain the scenario, compare the supplied rates, preview an allocation change, or preview a distribution. Preview, Apply, and Dismiss keep the form unchanged until the user confirms.
- The Copilot model selector offers three free OpenRouter models. Automatic is selected by default.

## Tech stack

- React 19 and TypeScript
- Vite 8, with the site base path `/lendinvest-test/`
- Tailwind CSS 4
- Vitest and Testing Library
- GitHub Pages for the public frontend
- A Cloudflare Worker for the production Copilot API

There is no router, component library, or chart library. The Copilot calls an OpenAI-compatible API. No AI SDK is installed.

## Architecture

Current Loans keeps its own React state. `invest()` in `src/loans.ts` is a pure function and returns a new loan list. Investment Lab does not call it and does not change those balances. Its calculations live in `src/lab.ts` and use integer pounds, basis points, and pence.

The Copilot has three separate steps:

1. The selected model may classify a question into a fixed intent. The server rejects anything that does not match that shape.
2. TypeScript validates the intent and calculates every amount, share, return, and proposed change.
3. The same model may write a short explanation from those calculated facts. If that text contains a figure that is not in the facts, the screen keeps the facts and hides the explanation.

The screen renders financial figures from the TypeScript result. A model-authored number cannot become an allocation.

### Models

The selector in Investment Copilot sends one of these ids:

| Label | Model id |
| --- | --- |
| Automatic (free) | `openrouter/free` |
| Nemotron 3.5 Super | `nvidia/nemotron-3.5-super-vl:free` |
| Particle-1 | `particle-ai/particle-1:free` |

Automatic is the default. A missing `model` field also uses `openrouter/free`. Any other value returns HTTP 400 and does not call a model. Both the intent call and the explanation call use that same id. There is no paid-model fallback.

`src/copilotModels.ts` is the allowlist in this repository. The local API enforces it. The deployed Worker enforces the same list. The Worker source is not in this repository, so a future Worker change has to be deployed from that source separately.

### Local API and production Worker

`handleCopilotRequest` in `src/server/copilot.ts` does not depend on Vite. `src/server/viteAdapter.ts` exposes it at `POST /api/copilot` during `vite dev` and `vite preview`. The API key is read from the server environment. It is never given a `VITE_` name, so Vite does not put it in the browser bundle.

GitHub Pages serves only the static frontend. The production page sends Copilot questions to the Cloudflare Worker configured by `VITE_COPILOT_API_URL`. The current Worker is `https://lendinvest-copilot.alex-garulli.workers.dev`. It calls OpenRouter at `https://openrouter.ai/api/v1` for intent classification and explanations. Pages does not set `VITE_COPILOT_DEMO`, so the public Copilot is the live Worker, not a static demo.

The Worker accepts `POST` requests from `https://artitudinale1.github.io` only. Other origins are rejected.

### Turnstile

When the lab is open and the Worker is configured, Cloudflare Turnstile runs invisibly and the question is sent with a `turnstileToken`. The Worker checks that token with Siteverify before it reserves quota or calls OpenRouter. The panel links to the [Cloudflare Turnstile Privacy Addendum](https://www.cloudflare.com/turnstile-privacy-policy/).

### Rate limits

The Worker allows 3 Copilot questions per visitor in a 10-minute window and 15 questions per day. Each accepted question counts as two provider calls toward the daily budget. These limits are enforced after Siteverify. They are part of the Worker, not of the Pages build. The messages are “Too many Copilot questions. Please wait and try again.” and “The daily Copilot limit has been reached. Please try again tomorrow.”

## Environment and deployment

Do not commit secrets. `.env` and `.dev.vars` are gitignored.

Local model access uses `.env`:

- `COPILOT_PROVIDER`
- `COPILOT_API_KEY`
- `COPILOT_MODEL` (required for the provider to start; the visitor’s selection is the id that is called)
- `COPILOT_BASE_URL` (optional, OpenRouter for a local check against the same provider)

The Worker keeps `TURNSTILE_SECRET_KEY` and `COPILOT_API_KEY` as secrets. `COPILOT_PROVIDER`, `COPILOT_MODEL`, and `COPILOT_BASE_URL` are Worker variables. `TURNSTILE_ENV` stays unset in production so the hostname check remains `artitudinale1.github.io`.

The Pages build receives only:

- `VITE_COPILOT_API_URL`
- `VITE_TURNSTILE_SITE_KEY`

The Turnstile secret is not a Pages variable.

## Testing

```sh
npm test
npm run build
```

The tests cover loan investment, the simulator’s rounding and validation, Copilot intent handling, model selection and the allowlist, Turnstile behaviour, the local request handler, and the static demo path. The production build typechecks the project and emits `dist/`, including `favicon.svg`.

## Local development

```sh
npm ci
npm run dev
```

Open [http://localhost:5173/lendinvest-test/](http://localhost:5173/lendinvest-test/). With `VITE_COPILOT_API_URL` unset and `VITE_COPILOT_DEMO` unset, Ask uses the local `/api/copilot` route. Set `VITE_COPILOT_API_URL` only when you intend to call the Worker. `npm run preview` serves the production build and the same local API route.

## CI/CD

`.github/workflows/ci.yml` runs on pull requests and pushes. It installs with `npm ci`, then runs `npm test` and `npm run build`.

A second job deploys only after that job passes, and only for a push to the default branch, `master`. It rebuilds with the Pages variables above and publishes `dist/` with the official GitHub Pages actions. The workflow does not deploy the Worker. GitHub branch protection is not enabled on `master`; the workflow is what gates the Pages deploy.

## Financial simulation disclaimer

The balances, rates, and returns are fixture data for a technical demonstration. A return labelled here is an illustrative annual gross return based on the supplied annualised rate. It is not guaranteed, not a forecast, and not financial advice. The loan deadline is not treated as an investment term. Nothing in this application moves money or places an investment.
