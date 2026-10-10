import { z } from "zod";
import { MAX_OUTPUT_CHARS, MAX_TEXT_CHARS, STEP_TYPES, type Step, type Workflow } from "./schema";
import { renderTemplate } from "./template";
import { applyTransform, evaluateCondition, parseJsonLoose } from "./transforms";

export type RunStatus = "queued" | "running" | "waiting_approval" | "succeeded" | "failed";
export type StepStatus = "pending" | "running" | "waiting_approval" | "succeeded" | "failed" | "skipped";

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface StepRecord {
  stepId: string;
  type: Step["type"];
  name: string;
  status: StepStatus;
  input?: string;
  output?: string;
  error?: string;
  note?: string;
  startedAt?: string;
  durationMs?: number;
  usage?: AiUsage;
}

export interface RunState {
  status: RunStatus;
  /** Index of the next step to execute. */
  cursor: number;
  /** Output of the most recent step that produced data; becomes the next step's input. */
  current: string;
  steps: StepRecord[];
  inputs: Record<string, string>;
  skipNext: boolean;
  stoppedByCondition: boolean;
  error?: string;
  result?: string;
  approval?: { stepId: string; message: string };
}

/** Used to validate run state sent back by a client. */
export const runStateSchema = z.object({
  status: z.enum(["queued", "running", "waiting_approval", "succeeded", "failed"]),
  cursor: z.number().int().min(0).max(50),
  current: z.string().max(MAX_OUTPUT_CHARS),
  steps: z
    .array(
      z.object({
        stepId: z.string().max(40),
        type: z.enum(STEP_TYPES),
        name: z.string().max(80),
        status: z.enum(["pending", "running", "waiting_approval", "succeeded", "failed", "skipped"]),
        input: z.string().max(MAX_OUTPUT_CHARS).optional(),
        output: z.string().max(MAX_OUTPUT_CHARS).optional(),
        error: z.string().max(2000).optional(),
        note: z.string().max(300).optional(),
        startedAt: z.string().max(40).optional(),
        durationMs: z.number().optional(),
        usage: z.object({ inputTokens: z.number(), outputTokens: z.number(), model: z.string().max(80) }).optional(),
      }),
    )
    .max(20),
  inputs: z.record(z.string().max(40), z.string().max(MAX_TEXT_CHARS)),
  skipNext: z.boolean(),
  stoppedByCondition: z.boolean(),
  error: z.string().max(2000).optional(),
  result: z.string().max(MAX_OUTPUT_CHARS).optional(),
  approval: z.object({ stepId: z.string().max(40), message: z.string().max(300) }).optional(),
});

export interface AiRequest {
  prompt: string;
  maxTokens: number;
  json: boolean;
  signal: AbortSignal;
}

export interface EngineDeps {
  /** Calls the real model. Must throw on failure. Never return made-up text. */
  ai: (req: AiRequest) => Promise<{ text: string; usage: AiUsage }>;
  now?: () => number;
  stepTimeoutMs?: number;
}

const DEFAULT_STEP_TIMEOUT_MS = 30_000;
const MAX_RENDERED_PROMPT_CHARS = 16_000;

export function isTerminal(state: RunState): boolean {
  return state.status === "succeeded" || state.status === "failed";
}

export function createRun(wf: Workflow, inputs: Record<string, string> = {}): RunState {
  return {
    status: "queued",
    cursor: 0,
    current: "",
    steps: wf.steps.map((s) => ({ stepId: s.id, type: s.type, name: s.name, status: "pending" as const })),
    inputs,
    skipNext: false,
    stoppedByCondition: false,
  };
}

/** Confirms client-supplied state belongs to this workflow before it is trusted. */
export function stateMatchesWorkflow(wf: Workflow, state: RunState): string | null {
  if (state.steps.length !== wf.steps.length) return "Run state does not match the workflow";
  for (let i = 0; i < wf.steps.length; i++) {
    if (state.steps[i].stepId !== wf.steps[i].id || state.steps[i].type !== wf.steps[i].type) return "Run state does not match the workflow";
  }
  if (state.cursor > wf.steps.length) return "Run state has an invalid position";
  return null;
}

function outputsById(state: RunState): Record<string, string> {
  const map: Record<string, string> = {};
  for (const rec of state.steps) {
    if (rec.status === "succeeded") map[rec.stepId] = rec.output ?? "";
    else if (rec.status === "skipped") map[rec.stepId] = "";
  }
  return map;
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number, label: string): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)} seconds`));
    }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function finishIfDone(wf: Workflow, s: RunState): void {
  if (s.cursor >= wf.steps.length && s.status !== "failed") {
    s.status = "succeeded";
    s.result = s.result ?? s.current;
  }
}

/** Executes exactly one step and returns the new state. The input state is not mutated. */
export async function advance(wf: Workflow, state: RunState, deps: EngineDeps): Promise<RunState> {
  if (isTerminal(state) || state.status === "waiting_approval") return state;

  const s: RunState = structuredClone(state);
  s.status = "running";
  if (s.cursor >= wf.steps.length) {
    finishIfDone(wf, s);
    return s;
  }

  const step = wf.steps[s.cursor];
  const rec = s.steps[s.cursor];
  const now = deps.now ?? Date.now;
  const started = now();
  rec.startedAt = new Date(started).toISOString();

  if (s.skipNext) {
    s.skipNext = false;
    rec.status = "skipped";
    rec.output = "";
    rec.note = "Skipped because the previous condition was not met";
    s.cursor++;
    finishIfDone(wf, s);
    return s;
  }

  rec.status = "running";
  rec.input = s.current;

  try {
    const timeoutMs = deps.stepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;
    switch (step.type) {
      case "manual_trigger": {
        rec.output = "";
        break;
      }
      case "text_input": {
        const value = s.inputs[step.id] ?? step.config.defaultValue;
        if (step.config.required && !value.trim()) throw new Error(`"${step.config.label}" is required`);
        if (value.length > MAX_TEXT_CHARS) throw new Error(`"${step.config.label}" is longer than ${MAX_TEXT_CHARS} characters`);
        rec.output = value;
        s.current = value;
        break;
      }
      case "ai_process": {
        const prompt = renderTemplate(step.config.prompt, { input: s.current, steps: outputsById(s) });
        if (prompt.length > MAX_RENDERED_PROMPT_CHARS) throw new Error("The prompt is too long after inserting earlier outputs. Shorten the input or the prompt.");
        const json = step.config.outputFormat === "json";
        const res = await withTimeout((signal) => deps.ai({ prompt, maxTokens: step.config.maxTokens, json, signal }), timeoutMs, "The AI call");
        let text = res.text;
        if (json) {
          try {
            text = JSON.stringify(parseJsonLoose(res.text), null, 2);
          } catch {
            throw new Error("The model did not return valid JSON");
          }
        } else {
          text = res.text.trim();
        }
        if (!text.trim()) throw new Error("The model returned an empty response");
        rec.output = text.slice(0, MAX_OUTPUT_CHARS);
        rec.usage = res.usage;
        s.current = rec.output;
        break;
      }
      case "condition": {
        const passed = evaluateCondition(step.config, s.current);
        rec.output = s.current;
        if (passed) {
          rec.note = "Condition met";
        } else if (step.config.onFalse === "stop") {
          rec.note = "Condition not met, so the workflow stopped here";
          s.stoppedByCondition = true;
          for (let i = s.cursor + 1; i < s.steps.length; i++) {
            s.steps[i].status = "skipped";
            s.steps[i].note = "Not run because an earlier condition stopped the workflow";
          }
          s.result = s.current;
          rec.status = "succeeded";
          rec.durationMs = now() - started;
          s.cursor = wf.steps.length;
          finishIfDone(wf, s);
          return s;
        } else {
          rec.note = "Condition not met, so the next step is skipped";
          s.skipNext = true;
        }
        break;
      }
      case "transform": {
        rec.output = applyTransform(step.config, s.current).slice(0, MAX_OUTPUT_CHARS);
        s.current = rec.output;
        break;
      }
      case "human_approval": {
        rec.status = "waiting_approval";
        rec.output = s.current;
        rec.note = "Waiting for a person to approve";
        s.status = "waiting_approval";
        s.approval = { stepId: step.id, message: step.config.message };
        rec.durationMs = now() - started;
        return s;
      }
      case "save_result": {
        rec.output = s.current;
        rec.note = `Marked as "${step.config.label}"`;
        s.result = s.current;
        break;
      }
    }
    rec.status = "succeeded";
    rec.durationMs = now() - started;
    s.cursor++;
    finishIfDone(wf, s);
    return s;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    rec.status = "failed";
    rec.error = message;
    rec.durationMs = now() - started;
    s.status = "failed";
    s.error = `"${step.name}" failed: ${message}`;
    return s;
  }
}

/** Approves or rejects the step a run is waiting on. */
export function resolveApproval(wf: Workflow, state: RunState, approved: boolean): RunState {
  if (state.status !== "waiting_approval") throw new Error("This run is not waiting for approval");
  const s: RunState = structuredClone(state);
  const rec = s.steps[s.cursor];
  s.approval = undefined;
  if (approved) {
    rec.status = "succeeded";
    rec.note = "Approved";
    s.status = "running";
    s.cursor++;
    finishIfDone(wf, s);
  } else {
    rec.status = "failed";
    rec.error = "Rejected by reviewer";
    s.status = "failed";
    s.error = `"${rec.name}" failed: Rejected by reviewer`;
  }
  return s;
}

/** Runs until the workflow finishes, fails, or pauses for approval. */
export async function runToCompletion(
  wf: Workflow,
  state: RunState,
  deps: EngineDeps,
  onStep?: (s: RunState) => void,
): Promise<RunState> {
  let cur = state;
  for (let i = 0; i <= wf.steps.length + 1; i++) {
    if (isTerminal(cur) || cur.status === "waiting_approval") break;
    cur = await advance(wf, cur, deps);
    onStep?.(cur);
  }
  return cur;
}

export interface UsageSummary {
  inputTokens: number;
  outputTokens: number;
  aiCalls: number;
  estimatedCostUsd: number;
  totalDurationMs: number;
}

export function summarizeUsage(state: RunState, inputCostPerMTok: number, outputCostPerMTok: number): UsageSummary {
  let inputTokens = 0;
  let outputTokens = 0;
  let aiCalls = 0;
  let totalDurationMs = 0;
  for (const rec of state.steps) {
    if (rec.usage) {
      inputTokens += rec.usage.inputTokens;
      outputTokens += rec.usage.outputTokens;
      aiCalls++;
    }
    totalDurationMs += rec.durationMs ?? 0;
  }
  const estimatedCostUsd = (inputTokens * inputCostPerMTok + outputTokens * outputCostPerMTok) / 1_000_000;
  return { inputTokens, outputTokens, aiCalls, estimatedCostUsd, totalDurationMs };
}
