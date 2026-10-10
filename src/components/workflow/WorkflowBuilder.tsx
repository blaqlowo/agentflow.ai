"use client";

import { useState } from "react";
import { ArrowDown, ChevronDown, ChevronUp, GitBranch, Play, Plus, Save, Sparkles, Trash2, TextCursorInput, UserCheck, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { CONDITION_OPERATORS, defaultStep, nextStepId, STEP_LABELS, TRANSFORM_OPERATIONS, type Step, type StepType, type Workflow } from "@/lib/workflow/schema";
import type { RunState } from "@/lib/workflow/engine";
import type { Issue } from "@/lib/workflow/validate";
import { cn } from "@/lib/utils";

const META: Record<StepType, { icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  manual_trigger: { icon: Play, tone: "text-muted bg-raised" },
  text_input: { icon: TextCursorInput, tone: "text-brand bg-brand/10" },
  ai_process: { icon: Sparkles, tone: "text-accent bg-accent/10" },
  condition: { icon: GitBranch, tone: "text-warn bg-warn/10" },
  transform: { icon: Shuffle, tone: "text-ok bg-ok/10" },
  human_approval: { icon: UserCheck, tone: "text-bad bg-bad/10" },
  save_result: { icon: Save, tone: "text-brand bg-brand/10" },
};

const OPERATOR_LABELS: Record<string, string> = {
  contains: "contains",
  not_contains: "does not contain",
  equals: "equals",
  not_equals: "does not equal",
  is_empty: "is empty",
  not_empty: "is not empty",
  length_gt: "is longer than (characters)",
  length_lt: "is shorter than (characters)",
};
const TRANSFORM_LABELS: Record<string, string> = {
  trim: "Trim whitespace",
  uppercase: "Uppercase",
  lowercase: "Lowercase",
  truncate: "Truncate to N characters",
  word_count: "Count words",
  extract_json_field: "Extract a JSON field",
  replace_text: "Replace text",
};

interface Props {
  workflow: Workflow;
  onChange: (w: Workflow) => void;
  run: RunState | null;
  issues: Issue[];
  disabled?: boolean;
  allowedTypes: StepType[];
}

export function WorkflowBuilder({ workflow, onChange, run, issues, disabled, allowedTypes }: Props) {
  const steps = workflow.steps;
  const setSteps = (next: Step[]) => onChange({ ...workflow, steps: next });

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 1 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    setSteps(next);
  };

  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="wf-name">Workflow name</Label>
          <Input id="wf-name" value={workflow.name} maxLength={80} disabled={disabled} onChange={(e) => onChange({ ...workflow, name: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="wf-desc">Description</Label>
          <Input id="wf-desc" value={workflow.description} maxLength={300} disabled={disabled} onChange={(e) => onChange({ ...workflow, description: e.target.value })} />
        </div>
      </div>

      <ol className="space-y-0">
        {steps.map((step, i) => {
          const rec = run?.steps[i];
          const prev = i > 0 ? run?.steps[i - 1] : undefined;
          return (
            <li key={step.id}>
              {i > 0 && (
                <div className="ml-5 flex items-start gap-3 py-1.5" aria-hidden={!prev?.output}>
                  <ArrowDown className="mt-0.5 h-4 w-4 shrink-0 text-faint" aria-hidden />
                  <p className="min-w-0 text-xs text-faint">
                    {prev?.output
                      ? <>Passes <span className="font-mono text-muted">{prev.output.replace(/\s+/g, " ").slice(0, 120)}{prev.output.length > 120 ? "…" : ""}</span></>
                      : i === 1 ? "Starts the workflow" : "Passes the previous step's output forward"}
                  </p>
                </div>
              )}
              <StepCard
                step={step}
                index={i}
                total={steps.length}
                earlierIds={steps.slice(0, i).filter((s) => s.type !== "manual_trigger" && s.type !== "condition").map((s) => s.id)}
                status={rec?.status}
                issues={issues.filter((x) => x.stepId === step.id)}
                disabled={disabled}
                onChange={(s) => setSteps(steps.map((x, k) => (k === i ? s : x)))}
                onMove={(d) => move(i, d)}
                onRemove={() => setSteps(steps.filter((_, k) => k !== i))}
              />
            </li>
          );
        })}
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs text-muted">Add a step</span>
        {allowedTypes.filter((t) => t !== "manual_trigger").map((t) => {
          const Icon = META[t].icon;
          return (
            <Button
              key={t}
              size="sm"
              disabled={disabled || steps.length >= 10}
              onClick={() => setSteps([...steps, defaultStep(t, nextStepId(steps, t))])}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {STEP_LABELS[t]}
            </Button>
          );
        })}
        {steps.length >= 10 && <span className="text-xs text-warn">Maximum of 10 steps</span>}
      </div>
    </div>
  );
}

const STATUS_RING: Record<string, string> = {
  running: "border-brand animate-working",
  succeeded: "border-ok/50",
  failed: "border-bad",
  waiting_approval: "border-warn",
  skipped: "border-line opacity-70",
};

function StepCard(props: {
  step: Step;
  index: number;
  total: number;
  earlierIds: string[];
  status?: string;
  issues: Issue[];
  disabled?: boolean;
  onChange: (s: Step) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { step, index, total, earlierIds, status, issues, disabled, onChange, onMove, onRemove } = props;
  const [open, setOpen] = useState(true);
  const Icon = META[step.type].icon;
  const pinned = step.type === "manual_trigger";

  return (
    <div className={cn("rounded-xl border bg-surface transition-colors", issues.length ? "border-bad/60" : status ? STATUS_RING[status] ?? "border-line" : "border-line")}>
      <div className="flex items-center gap-3 p-3">
        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", META[step.type].tone)}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <Input
            aria-label="Step name"
            className="h-8 border-transparent bg-transparent px-1 font-medium hover:border-line-strong"
            value={step.name}
            maxLength={60}
            disabled={disabled}
            onChange={(e) => onChange({ ...step, name: e.target.value } as Step)}
          />
          <p className="px-1 text-xs text-faint">
            {STEP_LABELS[step.type]} · <span className="font-mono">{step.id}</span>
          </p>
        </div>
        <div className="flex items-center">
          <Button variant="ghost" size="icon" aria-label="Move step up" disabled={disabled || pinned || index <= 1} onClick={() => onMove(-1)}>
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Move step down" disabled={disabled || pinned || index >= total - 1} onClick={() => onMove(1)}>
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button variant="danger" size="icon" aria-label="Remove step" disabled={disabled || pinned} onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
          {!pinned && (
            <Button variant="ghost" size="sm" onClick={() => setOpen(!open)} aria-expanded={open}>
              {open ? "Hide" : "Edit"}
            </Button>
          )}
        </div>
      </div>

      {issues.length > 0 && (
        <ul className="mx-3 mb-3 space-y-1 rounded-lg bg-bad/10 p-2.5 text-xs text-bad" role="alert">
          {issues.map((x, k) => <li key={k}>{x.message}</li>)}
        </ul>
      )}

      {open && !pinned && (
        <div className="space-y-3 border-t border-line p-3">
          <StepFields step={step} earlierIds={earlierIds} disabled={disabled} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

function StepFields({ step, earlierIds, disabled, onChange }: { step: Step; earlierIds: string[]; disabled?: boolean; onChange: (s: Step) => void }) {
  const idp = `f-${step.id}`;
  switch (step.type) {
    case "manual_trigger":
      return null;
    case "text_input": {
      const set = (patch: Partial<typeof step.config>) => onChange({ ...step, config: { ...step.config, ...patch } });
      return (
        <>
          <div>
            <Label htmlFor={`${idp}-label`}>Input label</Label>
            <Input id={`${idp}-label`} value={step.config.label} disabled={disabled} onChange={(e) => set({ label: e.target.value })} />
          </div>
          <div>
            <Label htmlFor={`${idp}-def`}>Default text</Label>
            <Textarea id={`${idp}-def`} value={step.config.defaultValue} disabled={disabled} onChange={(e) => set({ defaultValue: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={step.config.required} disabled={disabled} onChange={(e) => set({ required: e.target.checked })} />
            Required
          </label>
        </>
      );
    }
    case "ai_process": {
      const set = (patch: Partial<typeof step.config>) => onChange({ ...step, config: { ...step.config, ...patch } });
      const refs = ["input", ...earlierIds.map((id) => `steps.${id}`)];
      return (
        <>
          <div>
            <Label htmlFor={`${idp}-prompt`}>Prompt</Label>
            <Textarea id={`${idp}-prompt`} className="min-h-28 font-mono text-xs" value={step.config.prompt} disabled={disabled} onChange={(e) => set({ prompt: e.target.value })} />
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-faint">
              Insert
              {refs.map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={disabled}
                  className="rounded border border-line-strong px-1.5 py-0.5 font-mono text-muted hover:text-fg disabled:opacity-50"
                  onClick={() => set({ prompt: `${step.config.prompt}{{${r}}}` })}
                >
                  {`{{${r}}}`}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor={`${idp}-fmt`}>Output format</Label>
              <Select id={`${idp}-fmt`} value={step.config.outputFormat} disabled={disabled} onChange={(e) => set({ outputFormat: e.target.value as "text" | "json" })}>
                <option value="text">Text</option>
                <option value="json">JSON</option>
              </Select>
            </div>
            <div>
              <Label htmlFor={`${idp}-max`}>Max output tokens</Label>
              <Input id={`${idp}-max`} type="number" min={50} max={1000} value={step.config.maxTokens} disabled={disabled} onChange={(e) => set({ maxTokens: Number(e.target.value) })} />
            </div>
          </div>
        </>
      );
    }
    case "condition": {
      const set = (patch: Partial<typeof step.config>) => onChange({ ...step, config: { ...step.config, ...patch } });
      const needsValue = step.config.operator !== "is_empty" && step.config.operator !== "not_empty";
      return (
        <>
          <p className="text-xs text-muted">Checks the previous step's output.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor={`${idp}-op`}>It…</Label>
              <Select id={`${idp}-op`} value={step.config.operator} disabled={disabled} onChange={(e) => set({ operator: e.target.value as typeof step.config.operator })}>
                {CONDITION_OPERATORS.map((o) => <option key={o} value={o}>{OPERATOR_LABELS[o]}</option>)}
              </Select>
            </div>
            {needsValue && (
              <div>
                <Label htmlFor={`${idp}-val`}>Value</Label>
                <Input id={`${idp}-val`} value={step.config.value} disabled={disabled} onChange={(e) => set({ value: e.target.value })} />
              </div>
            )}
          </div>
          <div>
            <Label htmlFor={`${idp}-else`}>If not met</Label>
            <Select id={`${idp}-else`} value={step.config.onFalse} disabled={disabled} onChange={(e) => set({ onFalse: e.target.value as "stop" | "skip_next" })}>
              <option value="stop">Stop the workflow</option>
              <option value="skip_next">Skip the next step and continue</option>
            </Select>
          </div>
        </>
      );
    }
    case "transform": {
      const set = (patch: Partial<typeof step.config>) => onChange({ ...step, config: { ...step.config, ...patch } });
      const op = step.config.operation;
      return (
        <div className="grid grid-cols-2 gap-3">
          <div className={op === "replace_text" || op === "truncate" || op === "extract_json_field" ? "" : "col-span-2"}>
            <Label htmlFor={`${idp}-tr`}>Operation</Label>
            <Select id={`${idp}-tr`} value={op} disabled={disabled} onChange={(e) => set({ operation: e.target.value as typeof op })}>
              {TRANSFORM_OPERATIONS.map((o) => <option key={o} value={o}>{TRANSFORM_LABELS[o]}</option>)}
            </Select>
          </div>
          {(op === "truncate" || op === "extract_json_field" || op === "replace_text") && (
            <div>
              <Label htmlFor={`${idp}-a1`}>{op === "truncate" ? "Characters" : op === "extract_json_field" ? "Field path" : "Find"}</Label>
              <Input id={`${idp}-a1`} value={step.config.arg} disabled={disabled} placeholder={op === "extract_json_field" ? "summary or items.0.name" : ""} onChange={(e) => set({ arg: e.target.value })} />
            </div>
          )}
          {op === "replace_text" && (
            <div className="col-span-2">
              <Label htmlFor={`${idp}-a2`}>Replace with</Label>
              <Input id={`${idp}-a2`} value={step.config.arg2} disabled={disabled} onChange={(e) => set({ arg2: e.target.value })} />
            </div>
          )}
        </div>
      );
    }
    case "human_approval": {
      return (
        <div>
          <Label htmlFor={`${idp}-msg`}>Message shown to the reviewer</Label>
          <Input id={`${idp}-msg`} value={step.config.message} disabled={disabled} onChange={(e) => onChange({ ...step, config: { message: e.target.value } })} />
        </div>
      );
    }
    case "save_result": {
      return (
        <div>
          <Label htmlFor={`${idp}-lbl`}>Result label</Label>
          <Input id={`${idp}-lbl`} value={step.config.label} disabled={disabled} onChange={(e) => onChange({ ...step, config: { label: e.target.value } })} />
        </div>
      );
    }
  }
}
