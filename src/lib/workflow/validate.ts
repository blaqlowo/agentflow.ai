import { workflowSchema, type Workflow } from "./schema";
import { extractRefs } from "./template";
import { conditionConfigIssue, transformConfigIssue } from "./transforms";

export interface Issue {
  stepId?: string;
  message: string;
}

export type ValidationResult = { ok: true; workflow: Workflow } | { ok: false; issues: Issue[] };

export interface ValidateOptions {
  /** "demo" disables steps that need an account (approval, saving). */
  mode: "demo" | "full";
}

export function validateWorkflow(input: unknown, opts: ValidateOptions = { mode: "full" }): ValidationResult {
  const parsed = workflowSchema.safeParse(input);
  if (!parsed.success) {
    const steps = (input as { steps?: { id?: unknown }[] } | null)?.steps;
    const issues = parsed.error.issues.slice(0, 12).map((i) => {
      const idx = i.path[0] === "steps" && typeof i.path[1] === "number" ? i.path[1] : undefined;
      const sid = idx !== undefined && Array.isArray(steps) && typeof steps[idx]?.id === "string" ? (steps[idx].id as string) : undefined;
      const where = i.path.length ? `${i.path.join(".")}: ` : "";
      return { stepId: sid, message: `${where}${i.message}` };
    });
    return { ok: false, issues };
  }

  const wf = parsed.data;
  const issues: Issue[] = [];
  const seen = new Set<string>();

  if (wf.steps[0].type !== "manual_trigger") issues.push({ message: "The first step must be a manual trigger" });
  if (wf.steps.filter((s) => s.type === "manual_trigger").length > 1) issues.push({ message: "Only one manual trigger is allowed" });

  wf.steps.forEach((step, index) => {
    if (seen.has(step.id)) issues.push({ stepId: step.id, message: `Step id "${step.id}" is used more than once` });

    if (opts.mode === "demo" && (step.type === "human_approval" || step.type === "save_result")) {
      issues.push({ stepId: step.id, message: `"${step.name}" is not available in the public demo. Sign in to use it.` });
    }

    if (step.type === "ai_process") {
      for (const ref of extractRefs(step.config.prompt)) {
        if (ref === "input") continue;
        if (ref.startsWith("steps.")) {
          const target = ref.slice("steps.".length);
          const targetIndex = wf.steps.findIndex((s) => s.id === target);
          if (targetIndex === -1) issues.push({ stepId: step.id, message: `{{${ref}}} refers to a step that does not exist` });
          else if (targetIndex >= index) issues.push({ stepId: step.id, message: `{{${ref}}} refers to a step that runs later` });
        } else {
          issues.push({ stepId: step.id, message: `{{${ref}}} is not a valid reference. Use {{input}} or {{steps.step_id}}` });
        }
      }
    }

    if (step.type === "transform") {
      const msg = transformConfigIssue(step.config);
      if (msg) issues.push({ stepId: step.id, message: msg });
    }
    if (step.type === "condition") {
      const msg = conditionConfigIssue(step.config);
      if (msg) issues.push({ stepId: step.id, message: msg });
      if (step.config.onFalse === "skip_next" && index === wf.steps.length - 1) {
        issues.push({ stepId: step.id, message: "Skip next needs a step after the condition" });
      }
    }
    seen.add(step.id);
  });

  return issues.length ? { ok: false, issues } : { ok: true, workflow: wf };
}
