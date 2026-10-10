"use client";

import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, MinusCircle, PauseCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import type { RunState, StepStatus, UsageSummary } from "@/lib/workflow/engine";
import type { Workflow } from "@/lib/workflow/schema";
import type { Issue } from "@/lib/workflow/validate";
import { cn, formatCost, formatDuration } from "@/lib/utils";

const STATUS: Record<StepStatus, { label: string; tone: "neutral" | "ok" | "bad" | "warn" | "brand"; icon: React.ComponentType<{ className?: string }> }> = {
  pending: { label: "Not run", tone: "neutral", icon: CircleDashed },
  running: { label: "Running", tone: "brand", icon: Loader2 },
  waiting_approval: { label: "Waiting for approval", tone: "warn", icon: PauseCircle },
  succeeded: { label: "Succeeded", tone: "ok", icon: CheckCircle2 },
  failed: { label: "Failed", tone: "bad", icon: XCircle },
  skipped: { label: "Skipped", tone: "neutral", icon: MinusCircle },
};

const RUN_LABEL: Record<RunState["status"], string> = {
  queued: "Queued",
  running: "Running",
  waiting_approval: "Waiting for approval",
  succeeded: "Succeeded",
  failed: "Failed",
};

interface Props {
  workflow: Workflow;
  run: RunState | null;
  running: boolean;
  runError: string | null;
  usage: UsageSummary | null;
  remainingAiCalls: number | null;
  inputs: Record<string, string>;
  issues: Issue[];
  aiReady: boolean;
  onInput: (id: string, value: string) => void;
  onRun: () => void;
  onCancel: () => void;
}

export function RunPanel({ workflow, run, running, runError, usage, remainingAiCalls, inputs, issues, aiReady, onInput, onRun, onCancel }: Props) {
  const textInputs = workflow.steps.filter((s) => s.type === "text_input");
  const needsAi = workflow.steps.some((s) => s.type === "ai_process");

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        {textInputs.map((s) =>
          s.type === "text_input" ? (
            <div key={s.id}>
              <Label htmlFor={`run-${s.id}`}>{s.config.label}</Label>
              <Textarea
                id={`run-${s.id}`}
                className="min-h-24 max-h-56"
                value={inputs[s.id] ?? s.config.defaultValue}
                disabled={running}
                onChange={(e) => onInput(s.id, e.target.value)}
              />
            </div>
          ) : null,
        )}
      </div>

      {issues.length > 0 && (
        <div className="rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm text-bad" role="alert">
          <p className="font-medium">Fix these before running</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
            {issues.slice(0, 5).map((i, k) => <li key={k}>{i.message}</li>)}
          </ul>
        </div>
      )}

      {needsAi && !aiReady && (
        <p className="flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          The AI provider is not configured on this server, so AI steps will fail. See the setup notice above.
        </p>
      )}

      <div className="flex items-center gap-2">
        {running ? (
          <Button variant="secondary" onClick={onCancel} className="flex-1">Cancel run</Button>
        ) : (
          <Button variant="primary" onClick={onRun} disabled={issues.length > 0} className="flex-1">
            {run ? "Run again" : "Run workflow"}
          </Button>
        )}
      </div>
      {remainingAiCalls !== null && <p className="-mt-3 text-xs text-faint">{remainingAiCalls} demo AI calls left today</p>}

      {runError && (
        <p className="rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm text-bad" role="alert">{runError}</p>
      )}

      {run && (
        <div className="space-y-3" aria-live="polite">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Execution</h3>
            <Badge tone={run.status === "succeeded" ? "ok" : run.status === "failed" ? "bad" : run.status === "waiting_approval" ? "warn" : "brand"}>
              {running && run.status !== "failed" && run.status !== "succeeded" ? "Running" : RUN_LABEL[run.status]}
            </Badge>
          </div>

          <ol className="space-y-2">
            {workflow.steps.map((step, i) => {
              const rec = run.steps[i];
              const live = running && !runError && rec.status === "pending" && i === run.cursor && run.status !== "failed" && run.status !== "succeeded";
              const st = STATUS[live ? "running" : rec.status];
              const Icon = st.icon;
              return (
                <li key={step.id} className={cn("rounded-lg border p-3", rec.status === "failed" ? "border-bad/50 bg-bad/5" : "border-line bg-canvas/40")}>
                  <div className="flex items-center gap-2">
                    <Icon className={cn("h-4 w-4 shrink-0", st.tone === "ok" && "text-ok", st.tone === "bad" && "text-bad", st.tone === "brand" && "text-brand", st.tone === "warn" && "text-warn", st.tone === "neutral" && "text-faint", live && "animate-spin")} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{step.name}</span>
                    <span className="text-xs text-faint">{live ? "Running" : st.label}</span>
                    {rec.durationMs !== undefined && <span className="font-mono text-xs text-faint">{formatDuration(rec.durationMs)}</span>}
                  </div>
                  {rec.note && <p className="mt-1 pl-6 text-xs text-muted">{rec.note}</p>}
                  {rec.error && <p className="mt-1 pl-6 text-xs text-bad">{rec.error}</p>}
                  {rec.output ? (
                    <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-canvas p-2.5 font-mono text-xs leading-relaxed text-muted">{rec.output}</pre>
                  ) : null}
                  {rec.usage && (
                    <p className="mt-1.5 pl-6 font-mono text-[11px] text-faint">
                      {rec.usage.model} · {rec.usage.inputTokens} in / {rec.usage.outputTokens} out tokens
                    </p>
                  )}
                </li>
              );
            })}
          </ol>

          {run.status === "succeeded" && (
            <div className="rounded-lg border border-ok/40 bg-ok/10 p-3">
              <p className="mb-1.5 text-sm font-semibold text-ok">{run.stoppedByCondition ? "Finished early at a condition" : "Result"}</p>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-fg">{run.result || "(empty)"}</pre>
            </div>
          )}
          {run.status === "failed" && run.error && (
            <div className="rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm text-bad">
              <p className="font-semibold">Run failed</p>
              <p className="mt-1">{run.error}</p>
            </div>
          )}

          {usage && usage.aiCalls > 0 && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-line p-3 text-xs">
              <dt className="text-faint">AI calls</dt><dd className="text-right font-mono">{usage.aiCalls}</dd>
              <dt className="text-faint">Tokens in / out</dt><dd className="text-right font-mono">{usage.inputTokens} / {usage.outputTokens}</dd>
              <dt className="text-faint">Estimated cost</dt><dd className="text-right font-mono">{formatCost(usage.estimatedCostUsd)}</dd>
              <dt className="text-faint">Total step time</dt><dd className="text-right font-mono">{formatDuration(usage.totalDurationMs)}</dd>
            </dl>
          )}
        </div>
      )}
    </div>
  );
}
