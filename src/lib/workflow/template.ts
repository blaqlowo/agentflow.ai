const TOKEN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

export interface TemplateContext {
  input: string;
  steps: Record<string, string>;
}

/** Returns every {{reference}} found in a template. */
export function extractRefs(template: string): string[] {
  return [...template.matchAll(TOKEN)].map((m) => m[1]);
}

/**
 * Replaces {{input}} and {{steps.<id>}} with real values.
 * Throws on an unknown reference so a typo can never silently produce a bad prompt.
 */
export function renderTemplate(template: string, ctx: TemplateContext): string {
  return template.replace(TOKEN, (_m, ref: string) => {
    if (ref === "input") return ctx.input;
    if (ref.startsWith("steps.")) {
      const id = ref.slice("steps.".length);
      if (Object.prototype.hasOwnProperty.call(ctx.steps, id)) return ctx.steps[id];
    }
    throw new Error(`Unknown reference {{${ref}}}`);
  });
}
