import { describe, expect, it, vi } from "vitest";
import { advance, createRun, resolveApproval, runToCompletion, runStateSchema, stateMatchesWorkflow, summarizeUsage, type EngineDeps } from "@/lib/workflow/engine";
import { validateWorkflow } from "@/lib/workflow/validate";
import { feedbackTriage } from "@/lib/workflow/samples";
import { defaultStep, type Workflow } from "@/lib/workflow/schema";
import { applyTransform } from "@/lib/workflow/transforms";
import { renderTemplate } from "@/lib/workflow/template";

const usage = { inputTokens: 10, outputTokens: 5, model: "test-model" };

function wf(steps: Workflow["steps"]): Workflow {
  const r = validateWorkflow({ version: 1, name: "t", description: "", steps }, { mode: "full" });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.workflow;
}
const trigger = () => defaultStep("manual_trigger", "start");
function textInput(def = "hello") {
  const s = defaultStep("text_input", "in");
  if (s.type === "text_input") s.config.defaultValue = def;
  return s;
}
function ai(id: string, prompt: string, format: "text" | "json" = "text") {
  const s = defaultStep("ai_process", id);
  if (s.type === "ai_process") {
    s.config.prompt = prompt;
    s.config.outputFormat = format;
  }
  return s;
}
/** Test double standing in for the model. Only used in tests, never in the app. */
const echoAi = (): EngineDeps => ({ ai: vi.fn(async (req) => ({ text: `ECHO:${req.prompt}`, usage })) });

describe("engine", () => {
  it("passes outputs between steps", async () => {
    const w = wf([trigger(), textInput("abc"), ai("a", "Say {{input}}")]);
    const deps = echoAi();
    const out = await runToCompletion(w, createRun(w), deps);
    expect(out.status).toBe("succeeded");
    expect(out.result).toBe("ECHO:Say abc");
    expect(out.steps.map((s) => s.status)).toEqual(["succeeded", "succeeded", "succeeded"]);
    expect(out.steps[2].input).toBe("abc");
  });

  it("uses supplied inputs over defaults", async () => {
    const w = wf([trigger(), textInput("default"), ai("a", "{{input}}")]);
    const out = await runToCompletion(w, createRun(w, { in: "custom" }), echoAi());
    expect(out.result).toBe("ECHO:custom");
  });

  it("fails the run when a required input is empty", async () => {
    const w = wf([trigger(), textInput(""), ai("a", "{{input}}")]);
    const deps = echoAi();
    const out = await runToCompletion(w, createRun(w), deps);
    expect(out.status).toBe("failed");
    expect(out.steps[1].status).toBe("failed");
    expect(out.steps[2].status).toBe("pending");
    expect(deps.ai).not.toHaveBeenCalled();
  });

  it("marks the run failed when the AI call throws and never reports success", async () => {
    const w = wf([trigger(), textInput(), ai("a", "{{input}}")]);
    const deps: EngineDeps = { ai: async () => { throw new Error("provider down"); } };
    const out = await runToCompletion(w, createRun(w), deps);
    expect(out.status).toBe("failed");
    expect(out.result).toBeUndefined();
    expect(out.steps[2].error).toBe("provider down");
    expect(out.error).toContain("provider down");
  });

  it("fails when a JSON step returns invalid JSON", async () => {
    const w = wf([trigger(), textInput(), ai("a", "{{input}}", "json")]);
    const deps: EngineDeps = { ai: async () => ({ text: "not json", usage }) };
    const out = await runToCompletion(w, createRun(w), deps);
    expect(out.status).toBe("failed");
    expect(out.steps[2].error).toContain("valid JSON");
  });

  it("accepts JSON wrapped in a code fence", async () => {
    const w = wf([trigger(), textInput(), ai("a", "{{input}}", "json")]);
    const deps: EngineDeps = { ai: async () => ({ text: '```json\n{"n": 1}\n```', usage }) };
    const out = await runToCompletion(w, createRun(w), deps);
    expect(out.status).toBe("succeeded");
    expect(JSON.parse(out.result!)).toEqual({ n: 1 });
  });

  it("times out slow AI calls and fails the step", async () => {
    const w = wf([trigger(), textInput(), ai("a", "{{input}}")]);
    const deps: EngineDeps = { stepTimeoutMs: 20, ai: () => new Promise(() => {}) };
    const out = await runToCompletion(w, createRun(w), deps);
    expect(out.status).toBe("failed");
    expect(out.steps[2].error).toContain("timed out");
  });

  it("stops the workflow when a condition fails with onFalse=stop", async () => {
    const c = defaultStep("condition", "c");
    if (c.type === "condition") Object.assign(c.config, { operator: "contains", value: "zzz", onFalse: "stop" });
    const w = wf([trigger(), textInput("abc"), c, ai("a", "{{input}}")]);
    const deps = echoAi();
    const out = await runToCompletion(w, createRun(w), deps);
    expect(out.status).toBe("succeeded");
    expect(out.stoppedByCondition).toBe(true);
    expect(out.steps[3].status).toBe("skipped");
    expect(out.result).toBe("abc");
    expect(deps.ai).not.toHaveBeenCalled();
  });

  it("skips only the next step with onFalse=skip_next", async () => {
    const c = defaultStep("condition", "c");
    if (c.type === "condition") Object.assign(c.config, { operator: "contains", value: "zzz", onFalse: "skip_next" });
    const w = wf([trigger(), textInput("abc"), c, ai("skipped", "no"), ai("ran", "yes {{input}}")]);
    const out = await runToCompletion(w, createRun(w), echoAi());
    expect(out.status).toBe("succeeded");
    expect(out.steps[3].status).toBe("skipped");
    expect(out.steps[4].status).toBe("succeeded");
    expect(out.result).toBe("ECHO:yes abc");
  });

  it("continues through a condition that passes", async () => {
    const c = defaultStep("condition", "c");
    if (c.type === "condition") Object.assign(c.config, { operator: "contains", value: "ab", onFalse: "stop" });
    const w = wf([trigger(), textInput("abc"), c, ai("a", "{{input}}")]);
    const out = await runToCompletion(w, createRun(w), echoAi());
    expect(out.steps[3].status).toBe("succeeded");
  });

  it("pauses for approval, then resumes after approval", async () => {
    const w = wf([trigger(), textInput("x"), defaultStep("human_approval", "ap"), ai("a", "after {{input}}")]);
    const deps = echoAi();
    const paused = await runToCompletion(w, createRun(w), deps);
    expect(paused.status).toBe("waiting_approval");
    expect(paused.steps[2].status).toBe("waiting_approval");
    expect(deps.ai).not.toHaveBeenCalled();
    const stillPaused = await advance(w, paused, deps);
    expect(stillPaused.status).toBe("waiting_approval");
    const resumed = resolveApproval(w, paused, true);
    const done = await runToCompletion(w, resumed, deps);
    expect(done.status).toBe("succeeded");
    expect(done.result).toBe("ECHO:after x");
  });

  it("fails the run when approval is rejected", async () => {
    const w = wf([trigger(), textInput("x"), defaultStep("human_approval", "ap"), ai("a", "{{input}}")]);
    const deps = echoAi();
    const paused = await runToCompletion(w, createRun(w), deps);
    const rejected = resolveApproval(w, paused, false);
    expect(rejected.status).toBe("failed");
    expect(rejected.steps[3].status).toBe("pending");
    expect(() => resolveApproval(w, rejected, true)).toThrow();
  });

  it("does not mutate the state passed in", async () => {
    const w = wf([trigger(), textInput()]);
    const s0 = createRun(w);
    const snapshot = JSON.stringify(s0);
    await advance(w, s0, echoAi());
    expect(JSON.stringify(s0)).toBe(snapshot);
  });

  it("runs a built-in sample end to end with a stand-in model", async () => {
    const r = validateWorkflow(feedbackTriage.workflow, { mode: "demo" });
    if (!r.ok) throw new Error("sample invalid");
    const deps: EngineDeps = {
      ai: async (req) => ({
        text: req.json ? '{"overall_sentiment":"mixed","urgent_count":2,"urgent_items":["double charge","data loss"]}' : "ok",
        usage,
      }),
    };
    const out = await runToCompletion(r.workflow, createRun(r.workflow), deps);
    expect(out.status).toBe("succeeded");
    expect(out.steps.find((s) => s.stepId === "urgent_count")?.output).toBe("2");
    expect(out.steps.find((s) => s.stepId === "escalate")?.status).toBe("succeeded");
    const s = summarizeUsage(out, 1, 5);
    expect(s.aiCalls).toBe(3);
    expect(s.inputTokens).toBe(30);
  });

  it("skips the escalation step when urgent_count is 0", async () => {
    const r = validateWorkflow(feedbackTriage.workflow, { mode: "demo" });
    if (!r.ok) throw new Error("sample invalid");
    const deps: EngineDeps = {
      ai: async (req) => ({ text: req.json ? '{"overall_sentiment":"positive","urgent_count":0,"urgent_items":[]}' : "ok", usage }),
    };
    const out = await runToCompletion(r.workflow, createRun(r.workflow), deps);
    expect(out.steps.find((s) => s.stepId === "escalate")?.status).toBe("skipped");
    expect(out.status).toBe("succeeded");
  });
});

describe("run state validation", () => {
  it("round-trips through the schema", () => {
    const w = wf([trigger(), textInput()]);
    expect(runStateSchema.safeParse(createRun(w)).success).toBe(true);
  });
  it("detects state from a different workflow", () => {
    const a = wf([trigger(), textInput()]);
    const b = wf([trigger(), textInput(), ai("a", "x")]);
    expect(stateMatchesWorkflow(b, createRun(a))).not.toBeNull();
    expect(stateMatchesWorkflow(a, createRun(a))).toBeNull();
  });
});

describe("transforms and templates", () => {
  const t = (operation: string, arg = "", arg2 = "") => ({ operation, arg, arg2 }) as never;
  it("applies simple text transforms", () => {
    expect(applyTransform(t("trim"), "  a ")).toBe("a");
    expect(applyTransform(t("uppercase"), "ab")).toBe("AB");
    expect(applyTransform(t("truncate", "2"), "abcd")).toBe("ab");
    expect(applyTransform(t("word_count"), "a b  c")).toBe("3");
    expect(applyTransform(t("replace_text", "a", "b"), "banana")).toBe("bbnbnb");
  });
  it("extracts nested JSON fields and fails clearly", () => {
    expect(applyTransform(t("extract_json_field", "a.b.0"), '{"a":{"b":["x"]}}')).toBe("x");
    expect(() => applyTransform(t("extract_json_field", "zzz"), '{"a":1}')).toThrow(/not found/);
    expect(() => applyTransform(t("extract_json_field", "a"), "nope")).toThrow(/valid JSON/);
  });
  it("renders templates and rejects unknown references", () => {
    expect(renderTemplate("{{input}}-{{steps.a}}", { input: "i", steps: { a: "A" } })).toBe("i-A");
    expect(() => renderTemplate("{{steps.zzz}}", { input: "", steps: {} })).toThrow();
    expect(() => renderTemplate("{{constructor}}", { input: "", steps: {} })).toThrow();
  });
});
