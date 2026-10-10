# AgentFlow AI

Describe an automation in plain English, edit the generated workflow step by step, run it on a real execution engine, and inspect what every step did.

This is a portfolio project. The public demo works without an account and has daily usage limits enforced on the server.

## Status

This repository is built in stages. Only the items marked **Done** are implemented and tested.

| Area | Status |
| --- | --- |
| Workflow schema and validation (Zod) | Done, 10 tests |
| Execution engine (steps, conditions, transforms, approval pause and resume, timeouts, failure handling) | Done, 20 tests |
| Natural-language workflow generation with validation | Done (needs your API key) |
| Public demo: generate, edit, run, per-step results, tokens, estimated cost | Done (needs your API key) |
| Visual editor: add, remove, reorder, configure steps, data shown between steps | Done |
| Server-side demo limits | Done, in-memory (see Limits) |
| Landing page, example workflows | Done |
| Dashboard | Shell only. Shows "No data" until the database exists |
| Accounts (Supabase Auth), saved workflows, run history, approvals screen | Not built yet (Stage 3 and later) |
| Database-backed limits and usage records | Not built yet |
| Template library (six templates) | Three samples exist. The full library is not built |
| Integrations page and webhooks | Not built yet |

## How it works

- A workflow is a JSON document: an ordered list of steps (`manual_trigger`, `text_input`, `ai_process`, `condition`, `transform`, `human_approval`, `save_result`).
- `src/lib/workflow/validate.ts` checks every workflow before it can run, including generated ones. Invalid workflows are rejected and never executed.
- `src/lib/workflow/engine.ts` runs exactly one step per call and returns a new, serializable run state. Each step records its status, input, output, duration, tokens, and error. Any failure marks the run failed. Success is only reported when every step that had to run succeeded.
- `POST /api/demo/step` advances a run by one step, so the browser shows real progress. `POST /api/demo/generate` asks the model for a workflow and validates the answer. Both call the Anthropic API from the server only.
- Transforms use a fixed list of safe operations. There is no user-written code and no `eval`.
- Prompts can reference `{{input}}` (the previous step's output) and `{{steps.<id>}}` (an earlier step's output). Unknown references fail validation.
- If `ANTHROPIC_API_KEY` is missing, generation returns a setup message and AI steps fail with that message. Nothing is simulated.

## Run it locally

Requirements: Node.js 20 or newer.

```bash
npm install
cp .env.example .env.local     # then add your ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000. Check http://localhost:3000/api/health to see whether the server is configured.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Server-side API key. Required for generation and AI steps. Never prefix with `NEXT_PUBLIC_`. |
| `ANTHROPIC_MODEL` | Model used for generation and AI steps. Defaults to `claude-haiku-5-5`. |
| `AI_INPUT_COST_PER_MTOK`, `AI_OUTPUT_COST_PER_MTOK` | Your model's price in USD per million tokens, used for cost estimates. Check current pricing and update these. |
| `DEMO_GENERATIONS_PER_DAY` | Workflow generations per visitor per day. Default 5. |
| `DEMO_AI_CALLS_PER_DAY` | AI step calls per visitor per day. Default 20. |
| `DEMO_GLOBAL_AI_CALLS_PER_DAY` | Total AI calls per day across all visitors. Default 300. This is your spending ceiling. |
| `EMBED_ALLOWED_ORIGINS` | Origins allowed to embed the app in an iframe, comma-separated. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Not used yet. Reserved for the database and auth stage. |

Set a monthly spend limit in your Anthropic console as a second safety net.

## Testing

```bash
npm test            # unit tests for validation and the engine
npm run typecheck
npm run build
```

The tests use a stand-in function in place of the model so the engine's logic can be checked without network calls or cost. The app itself never fabricates model output.

## Limits

The demo limiter in `src/lib/limits.ts` runs on the server and keys visitors by a hashed IP address. In this stage its counters live in server memory. That is real server-side enforcement, but on a serverless host each instance keeps its own counters, so it is best-effort. The database-backed limiter in a later stage fixes this. The global daily cap and your provider spend limit are the hard ceiling on cost.

Demo runs are not stored. The browser holds the run state, and the server validates it on every call.

## Deploy to Vercel

1. Push this repository to GitHub.
2. In Vercel, choose **Add New**, then **Project**, and import the repository.
3. Under **Environment Variables**, add `ANTHROPIC_API_KEY` and any other variables above.
4. Deploy. Visit `/api/health` on your deployment to confirm `"anthropic": true`.

AI routes set `maxDuration = 60`. Plans that allow shorter function timeouts may need a lower value.

## Show it on your portfolio

- **Link (recommended):** add a "Live demo" button that points to your deployed URL.
- **Embed:** set `EMBED_ALLOWED_ORIGINS` to your portfolio's origin, for example `https://yourname.dev`. This value is read when the app is built, so redeploy after changing it. Then add:

```html
<iframe src="https://YOUR-APP.vercel.app/demo" title="AgentFlow AI demo"
        style="width:100%;height:900px;border:0;border-radius:12px" loading="lazy"></iframe>
```

Without that variable the app refuses to be embedded anywhere else.

## Project structure

```
src/app/                 pages and API routes
src/components/ui/       small shadcn-style components (Button, Card, Input, Badge)
src/components/workflow/ editor, run panel, demo screen
src/lib/workflow/        schema, validation, engine, transforms, samples
src/lib/ai/              Anthropic client and workflow generator
src/lib/limits.ts        demo limits
tests/                   Vitest tests
```

## Roadmap

1. Supabase tables with row-level security, accounts, saved workflows, run history.
2. Approval screen, dashboard from real records, database-backed limits and usage records.
3. Full template library, integrations architecture with an outgoing webhook step.
