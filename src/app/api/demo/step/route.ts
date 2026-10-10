import { z } from "zod";
import { callModel, STEP_SYSTEM_PROMPT } from "@/lib/ai/anthropic";
import { advance, createRun, isTerminal, runStateSchema, stateMatchesWorkflow, summarizeUsage, type EngineDeps } from "@/lib/workflow/engine";
import { MAX_TEXT_CHARS } from "@/lib/workflow/schema";
import { validateWorkflow } from "@/lib/workflow/validate";
import { demoLimits, pricing, SETUP_MESSAGE, getEnvStatus } from "@/lib/env";
import { json, readJson } from "@/lib/http";
import { consume, peek, visitorKey } from "@/lib/limits";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  workflow: z.unknown(),
  state: runStateSchema.nullish(),
  inputs: z.record(z.string().max(40), z.string().max(MAX_TEXT_CHARS)).optional(),
});

/**
 * Executes ONE step of a demo run and returns the new run state.
 * The client calls this repeatedly, which is what makes progress real and visible.
 * Demo runs are not stored; the browser holds the state.
 */
export async function POST(req: Request) {
  const body = await readJson(req, 160_000);
  if (!body.ok) return body.res;
  const parsed = bodySchema.safeParse(body.data);
  if (!parsed.success) return json({ error: "invalid_request", message: "The request was not valid." }, 400);

  const checked = validateWorkflow(parsed.data.workflow, { mode: "demo" });
  if (!checked.ok) return json({ error: "invalid_workflow", message: "The workflow is not valid, so it was not run.", issues: checked.issues }, 422);
  const wf = checked.workflow;

  const limits = demoLimits();
  const who = visitorKey(req);
  if (!consume(`step:${who}`, limits.stepCallsPerDay).ok) {
    return json({ error: "limit_reached", message: "Demo limit reached for today. Try again tomorrow." }, 429);
  }

  let state = parsed.data.state ?? null;
  if (state) {
    const mismatch = stateMatchesWorkflow(wf, state);
    if (mismatch) return json({ error: "invalid_request", message: mismatch }, 400);
  } else {
    state = createRun(wf, parsed.data.inputs ?? {});
  }

  const deps: EngineDeps = {
    stepTimeoutMs: 40_000,
    ai: async ({ prompt, maxTokens, json: wantJson, signal }) => {
      if (!getEnvStatus().anthropic) throw new Error(SETUP_MESSAGE);
      if (!consume(`ai:${who}`, limits.aiCallsPerDay).ok) {
        throw new Error(`Demo limit reached: ${limits.aiCallsPerDay} AI calls per day. Try again tomorrow, or run your own copy of the project.`);
      }
      if (!consume("global:ai", limits.globalAiCallsPerDay).ok) throw new Error("The demo has reached its daily capacity. Please try again tomorrow.");
      const suffix = wantJson ? "\n\nRespond with valid JSON only. No markdown, no commentary." : "";
      return callModel({ system: STEP_SYSTEM_PROMPT, prompt: prompt + suffix, maxTokens, signal });
    },
  };

  const next = isTerminal(state) ? state : await advance(wf, state, deps);
  const p = pricing();
  return json({
    state: next,
    usage: summarizeUsage(next, p.inputPerMTok, p.outputPerMTok),
    remainingAiCalls: peek(`ai:${who}`, limits.aiCallsPerDay).remaining,
  });
}
