import { describe, expect, it } from "vitest";
import { validateWorkflow } from "@/lib/workflow/validate";
import { defaultStep } from "@/lib/workflow/schema";
import { SAMPLES } from "@/lib/workflow/samples";

const base = () => ({
  version: 1,
  name: "Test",
  description: "",
  steps: [defaultStep("manual_trigger", "start"), defaultStep("text_input", "text_input_1")],
});

describe("validateWorkflow", () => {
  it("accepts every built-in sample in demo mode", () => {
    for (const s of SAMPLES) {
      const r = validateWorkflow(s.workflow, { mode: "demo" });
      expect(r.ok, s.slug).toBe(true);
    }
  });

  it("rejects non-workflow input", () => {
    expect(validateWorkflow(null).ok).toBe(false);
    expect(validateWorkflow({ version: 2 }).ok).toBe(false);
  });

  it("requires a manual trigger first", () => {
    const wf = base();
    wf.steps.reverse();
    const r = validateWorkflow(wf);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some((i) => i.message.includes("first step"))).toBe(true);
  });

  it("rejects duplicate step ids", () => {
    const wf = base();
    wf.steps.push(defaultStep("text_input", "text_input_1"));
    const r = validateWorkflow(wf);
    expect(r.ok).toBe(false);
  });

  it("rejects references to steps that do not exist or run later", () => {
    const wf = base();
    const ai = defaultStep("ai_process", "ai_1");
    if (ai.type === "ai_process") ai.config.prompt = "Use {{steps.nope}} and {{steps.ai_2}}";
    const ai2 = defaultStep("ai_process", "ai_2");
    wf.steps.push(ai, ai2);
    const r = validateWorkflow(wf);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.some((i) => i.message.includes("does not exist"))).toBe(true);
      expect(r.issues.some((i) => i.message.includes("runs later"))).toBe(true);
    }
  });

  it("rejects unknown template references", () => {
    const wf = base();
    const ai = defaultStep("ai_process", "ai_1");
    if (ai.type === "ai_process") ai.config.prompt = "Hello {{secret}}";
    wf.steps.push(ai);
    expect(validateWorkflow(wf).ok).toBe(false);
  });

  it("blocks approval and save steps in demo mode only", () => {
    const wf = base();
    wf.steps.push(defaultStep("human_approval", "approve_1"));
    expect(validateWorkflow(wf, { mode: "demo" }).ok).toBe(false);
    expect(validateWorkflow(wf, { mode: "full" }).ok).toBe(true);
  });

  it("enforces the step limit", () => {
    const wf = base();
    for (let i = 0; i < 12; i++) wf.steps.push(defaultStep("transform", `t_${i}`));
    expect(validateWorkflow(wf).ok).toBe(false);
  });

  it("catches bad transform and condition configs before a run", () => {
    const wf = base();
    const t = defaultStep("transform", "t_1");
    if (t.type === "transform") t.config.operation = "truncate";
    const c = defaultStep("condition", "c_1");
    if (c.type === "condition") {
      c.config.operator = "length_gt";
      c.config.value = "abc";
    }
    wf.steps.push(t, c);
    const r = validateWorkflow(wf);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.length).toBeGreaterThanOrEqual(2);
  });

  it("requires skip_next conditions to have a following step", () => {
    const wf = base();
    const c = defaultStep("condition", "c_1");
    if (c.type === "condition") c.config.onFalse = "skip_next";
    wf.steps.push(c);
    expect(validateWorkflow(wf).ok).toBe(false);
  });
});
