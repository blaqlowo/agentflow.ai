import type { Step } from "./schema";

type TransformConfig = Extract<Step, { type: "transform" }>["config"];
type ConditionConfig = Extract<Step, { type: "condition" }>["config"];

/** Removes a surrounding markdown code fence if the model added one. */
export function stripCodeFence(text: string): string {
  const t = text.trim();
  const m = t.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  return (m ? m[1] : t).trim();
}

export function parseJsonLoose(text: string): unknown {
  return JSON.parse(stripCodeFence(text));
}

function readPath(value: unknown, path: string): unknown {
  let cur: unknown = value;
  for (const key of path.split(".").filter(Boolean)) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

export function applyTransform(cfg: TransformConfig, input: string): string {
  switch (cfg.operation) {
    case "trim":
      return input.trim();
    case "uppercase":
      return input.toUpperCase();
    case "lowercase":
      return input.toLowerCase();
    case "truncate": {
      const n = Number.parseInt(cfg.arg, 10);
      if (!Number.isInteger(n) || n < 1 || n > 10000) throw new Error("Truncate needs a number of characters between 1 and 10000");
      return input.length > n ? input.slice(0, n) : input;
    }
    case "word_count":
      return String(input.trim() ? input.trim().split(/\s+/).length : 0);
    case "extract_json_field": {
      if (!cfg.arg.trim()) throw new Error("Extract JSON field needs a field path, for example summary or items.0.name");
      let parsed: unknown;
      try {
        parsed = parseJsonLoose(input);
      } catch {
        throw new Error("The previous output is not valid JSON, so a field cannot be extracted");
      }
      const found = readPath(parsed, cfg.arg.trim());
      if (found === undefined) throw new Error(`Field "${cfg.arg.trim()}" was not found in the JSON`);
      return typeof found === "string" ? found : JSON.stringify(found);
    }
    case "replace_text": {
      if (!cfg.arg) throw new Error("Replace text needs the text to find");
      return input.split(cfg.arg).join(cfg.arg2);
    }
  }
}

/** Static checks used by validation so bad configs are caught before a run. */
export function transformConfigIssue(cfg: TransformConfig): string | null {
  if (cfg.operation === "truncate") {
    const n = Number.parseInt(cfg.arg, 10);
    if (!Number.isInteger(n) || n < 1 || n > 10000) return "Truncate needs a number of characters between 1 and 10000";
  }
  if (cfg.operation === "extract_json_field" && !cfg.arg.trim()) return "Extract JSON field needs a field path";
  if (cfg.operation === "replace_text" && !cfg.arg) return "Replace text needs the text to find";
  return null;
}

export function conditionConfigIssue(cfg: ConditionConfig): string | null {
  if ((cfg.operator === "length_gt" || cfg.operator === "length_lt") && !Number.isInteger(Number(cfg.value))) {
    return "Length conditions need a whole number as the value";
  }
  if (["contains", "not_contains", "equals", "not_equals"].includes(cfg.operator) && cfg.value === "") {
    return "This condition needs a value to compare against";
  }
  return null;
}

/** Comparisons for text are case-insensitive and ignore surrounding whitespace. */
export function evaluateCondition(cfg: ConditionConfig, input: string): boolean {
  const a = input.trim().toLowerCase();
  const b = cfg.value.trim().toLowerCase();
  switch (cfg.operator) {
    case "contains":
      return a.includes(b);
    case "not_contains":
      return !a.includes(b);
    case "equals":
      return a === b;
    case "not_equals":
      return a !== b;
    case "is_empty":
      return a.length === 0;
    case "not_empty":
      return a.length > 0;
    case "length_gt":
      return input.length > Number(cfg.value);
    case "length_lt":
      return input.length < Number(cfg.value);
  }
}
