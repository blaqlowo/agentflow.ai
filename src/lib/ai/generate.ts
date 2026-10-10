import { callModel } from "./anthropic";
import { parseJsonLoose } from "@/lib/workflow/transforms";
import { validateWorkflow, type Issue } from "@/lib/workflow/validate";
import type { Workflow } from "@/lib/workflow/schema";
import type { AiUsage } from "@/lib/workflow/engine";

const GENERATOR_SYSTEM = `You design automation workflows. Reply with ONE JSON object and nothing else (no markdown, no commentary).

Shape:
{"version":1,"name":string,"description":string,"steps":[Step,...]}

Rules:
- 3 to 8 steps. The first step must be a manual_trigger. Every other step comes after it.
- Step ids are unique, lowercase snake_case (letters, numbers, underscores), for example "classify".
- Every step has: id, name (short, plain language), type, config.
- Allowed step types and their config:
  manual_trigger: {}
  text_input: {"label":string,"defaultValue":"","required":true}
  ai_process: {"prompt":string,"outputFormat":"text"|"json","maxTokens":number between 100 and 600}
  condition: {"operator":"contains"|"not_contains"|"equals"|"not_equals"|"is_empty"|"not_empty"|"length_gt"|"length_lt","value":string,"onFalse":"stop"|"skip_next"}
  transform: {"operation":"trim"|"uppercase"|"lowercase"|"truncate"|"word_count"|"extract_json_field"|"replace_text","arg":string,"arg2":string}
- Do NOT use human_approval or save_result.
- Put the user's data in a text_input step so the person can paste it later. Leave defaultValue empty.
- In ai_process prompts, {{input}} is the previous step's output and {{steps.<id>}} is the output of an EARLIER step with that id. Use no other {{...}} references.
- When an ai_process step needs structured data, set outputFormat to "json" and describe the exact JSON shape in the prompt. To read one field afterwards use a transform with operation "extract_json_field" and arg set to the field name.
- A condition checks the previous step's output. onFalse "stop" ends the workflow; "skip_next" skips only the following step.
- Keep prompts specific and short.`;

export type GenerateResult =
  | { ok: true; workflow: Workflow; usage: AiUsage }
  | { ok: false; message: string; issues?: Issue[]; usage?: AiUsage };

export async function generateWorkflow(request: string, signal?: AbortSignal): Promise<GenerateResult> {
  const res = await callModel({
    system: GENERATOR_SYSTEM,
    prompt: `Design a workflow for this request:\n\n${request}`,
    maxTokens: 2000,
    signal,
  });

  let raw: unknown;
  try {
    raw = parseJsonLoose(res.text);
  } catch {
    return { ok: false, message: "The model did not return a readable workflow. Try rephrasing your request.", usage: res.usage };
  }

  const checked = validateWorkflow(raw, { mode: "demo" });
  if (!checked.ok) {
    return {
      ok: false,
      message: "The model produced a workflow that failed validation, so it was not loaded. Try rephrasing your request.",
      issues: checked.issues,
      usage: res.usage,
    };
  }
  return { ok: true, workflow: checked.workflow, usage: res.usage };
}
