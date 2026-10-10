import { z } from "zod";
import { generateWorkflow } from "@/lib/ai/generate";
import { SetupError } from "@/lib/ai/anthropic";
import { demoLimits, getEnvStatus, pricing, SETUP_MESSAGE } from "@/lib/env";
import { json, readJson } from "@/lib/http";
import { consume, visitorKey } from "@/lib/limits";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({ prompt: z.string().trim().min(10, "Describe what you want to automate in a sentence or two").max(600, "Keep the request under 600 characters") });

export async function POST(req: Request) {
  if (!getEnvStatus().anthropic) return json({ error: "not_configured", message: SETUP_MESSAGE }, 503);

  const body = await readJson(req, 4000);
  if (!body.ok) return body.res;
  const parsed = bodySchema.safeParse(body.data);
  if (!parsed.success) return json({ error: "invalid_request", message: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);

  const limits = demoLimits();
  const who = visitorKey(req);
  const perVisitor = consume(`gen:${who}`, limits.generationsPerDay);
  if (!perVisitor.ok) {
    return json({ error: "limit_reached", message: `Demo limit reached: ${limits.generationsPerDay} generations per day. Try again tomorrow, or run your own copy of the project.` }, 429);
  }
  const global = consume("global:ai", limits.globalAiCallsPerDay);
  if (!global.ok) return json({ error: "limit_reached", message: "The demo has reached its daily capacity. Please try again tomorrow." }, 429);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 40_000);
  try {
    const result = await generateWorkflow(parsed.data.prompt, controller.signal);
    const p = pricing();
    const cost = result.usage ? (result.usage.inputTokens * p.inputPerMTok + result.usage.outputTokens * p.outputPerMTok) / 1e6 : 0;
    if (!result.ok) return json({ error: "invalid_workflow", message: result.message, issues: result.issues ?? [], usage: result.usage, estimatedCostUsd: cost, remaining: perVisitor.remaining }, 422);
    return json({ workflow: result.workflow, usage: result.usage, estimatedCostUsd: cost, remaining: perVisitor.remaining });
  } catch (err) {
    if (err instanceof SetupError) return json({ error: "not_configured", message: SETUP_MESSAGE }, 503);
    return json({ error: "ai_failed", message: err instanceof Error ? err.message : "The AI call failed." }, 502);
  } finally {
    clearTimeout(timer);
  }
}
