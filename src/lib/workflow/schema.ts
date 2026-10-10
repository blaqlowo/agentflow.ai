import { z } from "zod";

export const MAX_STEPS = 10;
export const MAX_PROMPT_CHARS = 4000;
export const MAX_TEXT_CHARS = 8000;
export const MAX_OUTPUT_CHARS = 20000;

export const STEP_TYPES = [
  "manual_trigger",
  "text_input",
  "ai_process",
  "condition",
  "transform",
  "human_approval",
  "save_result",
] as const;
export type StepType = (typeof STEP_TYPES)[number];

export const CONDITION_OPERATORS = [
  "contains",
  "not_contains",
  "equals",
  "not_equals",
  "is_empty",
  "not_empty",
  "length_gt",
  "length_lt",
] as const;

export const TRANSFORM_OPERATIONS = [
  "trim",
  "uppercase",
  "lowercase",
  "truncate",
  "word_count",
  "extract_json_field",
  "replace_text",
] as const;

const stepId = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,31}$/, "Step ids must start with a letter and use only lowercase letters, numbers, or underscores");
const stepName = z.string().trim().min(1, "Give the step a name").max(60);

const manualTrigger = z.object({
  id: stepId,
  name: stepName,
  type: z.literal("manual_trigger"),
  config: z.object({}).default({}),
});

const textInput = z.object({
  id: stepId,
  name: stepName,
  type: z.literal("text_input"),
  config: z.object({
    label: z.string().trim().min(1, "Add a label for this input").max(60),
    defaultValue: z.string().max(MAX_TEXT_CHARS).default(""),
    required: z.boolean().default(true),
  }),
});

const aiProcess = z.object({
  id: stepId,
  name: stepName,
  type: z.literal("ai_process"),
  config: z.object({
    prompt: z.string().trim().min(1, "Write a prompt for this step").max(MAX_PROMPT_CHARS),
    outputFormat: z.enum(["text", "json"]).default("text"),
    maxTokens: z.number().int().min(50).max(1000).default(500),
  }),
});

const condition = z.object({
  id: stepId,
  name: stepName,
  type: z.literal("condition"),
  config: z.object({
    operator: z.enum(CONDITION_OPERATORS),
    value: z.string().max(200).default(""),
    onFalse: z.enum(["stop", "skip_next"]).default("stop"),
  }),
});

const transform = z.object({
  id: stepId,
  name: stepName,
  type: z.literal("transform"),
  config: z.object({
    operation: z.enum(TRANSFORM_OPERATIONS),
    arg: z.string().max(200).default(""),
    arg2: z.string().max(200).default(""),
  }),
});

const humanApproval = z.object({
  id: stepId,
  name: stepName,
  type: z.literal("human_approval"),
  config: z.object({
    message: z.string().trim().max(300).default("Review the result and approve to continue."),
  }),
});

const saveResult = z.object({
  id: stepId,
  name: stepName,
  type: z.literal("save_result"),
  config: z.object({ label: z.string().trim().min(1).max(60).default("Result") }),
});

export const stepSchema = z.discriminatedUnion("type", [
  manualTrigger,
  textInput,
  aiProcess,
  condition,
  transform,
  humanApproval,
  saveResult,
]);

export const workflowSchema = z.object({
  version: z.literal(1),
  name: z.string().trim().min(1, "Name the workflow").max(80),
  description: z.string().trim().max(300).default(""),
  steps: z.array(stepSchema).min(1, "Add at least one step").max(MAX_STEPS, `A workflow can have at most ${MAX_STEPS} steps`),
});

export type Step = z.infer<typeof stepSchema>;
export type Workflow = z.infer<typeof workflowSchema>;
export type StepOf<T extends StepType> = Extract<Step, { type: T }>;

export const STEP_LABELS: Record<StepType, string> = {
  manual_trigger: "Manual trigger",
  text_input: "Text input",
  ai_process: "AI processing",
  condition: "Condition",
  transform: "Transform data",
  human_approval: "Human approval",
  save_result: "Save result",
};

/** Default config for a newly added step. */
export function defaultStep(type: StepType, id: string): Step {
  const name = STEP_LABELS[type];
  switch (type) {
    case "manual_trigger":
      return { id, name, type, config: {} };
    case "text_input":
      return { id, name, type, config: { label: "Input text", defaultValue: "", required: true } };
    case "ai_process":
      return { id, name, type, config: { prompt: "Summarize the following text in two sentences:\n{{input}}", outputFormat: "text", maxTokens: 400 } };
    case "condition":
      return { id, name, type, config: { operator: "not_empty", value: "", onFalse: "stop" } };
    case "transform":
      return { id, name, type, config: { operation: "trim", arg: "", arg2: "" } };
    case "human_approval":
      return { id, name, type, config: { message: "Review the result and approve to continue." } };
    case "save_result":
      return { id, name, type, config: { label: "Result" } };
  }
}

export function nextStepId(steps: { id: string }[], type: StepType): string {
  const used = new Set(steps.map((s) => s.id));
  let n = 1;
  while (used.has(`${type}_${n}`)) n++;
  return `${type}_${n}`;
}
