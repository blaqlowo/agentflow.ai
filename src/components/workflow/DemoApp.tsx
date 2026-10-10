"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label, Textarea } from "@/components/ui/input";
import { WorkflowBuilder } from "./WorkflowBuilder";
import { RunPanel } from "./RunPanel";
import { isTerminal, type RunState, type UsageSummary } from "@/lib/workflow/engine";
import type { StepType, Workflow } from "@/lib/workflow/schema";
import { SAMPLES } from "@/lib/workflow/samples";
import { validateWorkflow, type Issue } from "@/lib/workflow/validate";

const DEMO_TYPES: StepType[] = ["manual_trigger", "text_input", "ai_process", "condition", "transform"];
const EXAMPLE_PROMPT = "Analyze customer feedback, classify sentiment, identify urgent complaints, and produce a concise summary.";

interface Health {
  anthropic: boolean;
  demoLimits?: { generationsPerDay: number; aiCallsPerDay: number };
}

export function DemoApp({ initial }: { initial: Workflow }) {
  const [workflow, setWorkflow] = useState<Workflow>(initial);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<{ message: string; issues?: Issue[] } | null>(null);
  const [genNote, setGenNote] = useState<string | null>(null);
  const [run, setRun] = useState<RunState | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [health, setHealth] = useState<Health | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch("/api/health", { cache: "no-store" })
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  const issues = useMemo<Issue[]>(() => {
    const r = validateWorkflow(workflow, { mode: "demo" });
    return r.ok ? [] : r.issues;
  }, [workflow]);

  const clearRun = () => {
    setRun(null);
    setUsage(null);
    setRunError(null);
  };
  const edit = (w: Workflow) => {
    setWorkflow(w);
    clearRun();
  };
  const loadSample = (slug: string) => {
    const s = SAMPLES.find((x) => x.slug === slug);
    if (!s) return;
    setWorkflow(structuredClone(s.workflow));
    setInputs({});
    setGenNote(null);
    setGenError(null);
    clearRun();
  };

  async function generate() {
    setGenerating(true);
    setGenError(null);
    setGenNote(null);
    try {
      const res = await fetch("/api/demo/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGenError({ message: data.message ?? "Generation failed.", issues: data.issues });
        return;
      }
      setWorkflow(data.workflow);
      setInputs({});
      clearRun();
      setGenNote(`Generated ${data.workflow.steps.length} steps. Review and edit them below. Nothing has been run yet.`);
    } catch {
      setGenError({ message: "Could not reach the server. Check your connection and try again." });
    } finally {
      setGenerating(false);
    }
  }

  async function execute() {
    const check = validateWorkflow(workflow, { mode: "demo" });
    if (!check.ok) return;
    const full: Record<string, string> = {};
    for (const s of workflow.steps) if (s.type === "text_input") full[s.id] = inputs[s.id] ?? s.config.defaultValue;

    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setRunError(null);
    setUsage(null);
    setRun(null);

    let state: RunState | null = null;
    try {
      for (let i = 0; i < 30; i++) {
        const res = await fetch("/api/demo/step", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workflow, state, inputs: full }),
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setRunError(data.message ?? "The run could not continue.");
          break;
        }
        state = data.state as RunState;
        setRun(state);
        setUsage(data.usage);
        setRemaining(data.remainingAiCalls);
        if (isTerminal(state) || state.status === "waiting_approval") break;
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") setRunError("Run canceled. Steps that already finished are shown below.");
      else setRunError("Lost connection to the server. The run was interrupted and is not complete.");
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  const aiReady = health?.anthropic !== false;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Live demo</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Describe an automation or start from the sample. Edit the steps, then run it. Runs use a real model through a server-side endpoint and are limited per visitor each day.
        </p>
      </div>

      {health && !health.anthropic && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm" role="status">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
          <div>
            <p className="font-medium text-warn">The AI provider is not configured on this server</p>
            <p className="mt-1 text-muted">Generation and AI steps will fail until <span className="font-mono text-fg">ANTHROPIC_API_KEY</span> is set. You can still edit workflows and run steps that do not use AI. See the README for setup.</p>
          </div>
        </div>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>What would you like to automate?</CardTitle>
          <CardDescription>The model drafts a workflow. It is validated before it appears, and it never runs automatically.</CardDescription>
        </CardHeader>
        <CardContent>
          <Label htmlFor="prompt" className="sr-only">Describe the automation</Label>
          <Textarea id="prompt" value={prompt} maxLength={600} onChange={(e) => setPrompt(e.target.value)} placeholder={EXAMPLE_PROMPT} disabled={generating} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={generate} disabled={generating || prompt.trim().length < 10}>
              {generating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
              {generating ? "Generating…" : "Generate workflow"}
            </Button>
            <Button onClick={() => setPrompt(EXAMPLE_PROMPT)} disabled={generating}>Use the example</Button>
            <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
            {SAMPLES.map((s) => (
              <Button key={s.slug} variant="ghost" size="sm" onClick={() => loadSample(s.slug)} disabled={generating || running} title={s.summary}>
                Load: {s.workflow.name}
              </Button>
            ))}
          </div>
          {genNote && <p className="mt-3 text-sm text-ok" role="status">{genNote}</p>}
          {genError && (
            <div className="mt-3 rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm text-bad" role="alert">
              <p>{genError.message}</p>
              {genError.issues && genError.issues.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs">{genError.issues.slice(0, 4).map((i, k) => <li key={k}>{i.message}</li>)}</ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <section aria-label="Workflow editor">
          <WorkflowBuilder workflow={workflow} onChange={edit} run={run} issues={issues} disabled={running} allowedTypes={DEMO_TYPES} />
          <p className="mt-4 text-xs text-faint">Human approval and saving results need an account and are not part of the public demo.</p>
        </section>
        <aside aria-label="Run" className="lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Run</CardTitle>
              <CardDescription>Each step runs on the server. Results appear as they finish.</CardDescription>
            </CardHeader>
            <CardContent>
              <RunPanel
                workflow={workflow}
                run={run}
                running={running}
                runError={runError}
                usage={usage}
                remainingAiCalls={remaining}
                inputs={inputs}
                issues={issues}
                aiReady={aiReady}
                onInput={(id, v) => setInputs((p) => ({ ...p, [id]: v }))}
                onRun={execute}
                onCancel={() => abortRef.current?.abort()}
              />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
