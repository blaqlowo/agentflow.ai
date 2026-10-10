import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DEFAULT_SAMPLE, SAMPLES } from "@/lib/workflow/samples";
import { STEP_LABELS, type Step } from "@/lib/workflow/schema";

function outputKind(step: Step): string {
  switch (step.type) {
    case "manual_trigger": return "starts the run";
    case "text_input": return "text";
    case "ai_process": return step.config.outputFormat === "json" ? "JSON" : "text";
    case "condition": return step.config.onFalse === "stop" ? "continue or stop" : "continue or skip next";
    case "transform": return "text";
    case "human_approval": return "approval";
    case "save_result": return "saved result";
  }
}

const FEATURES: { title: string; body: string; status: "Live" | "Engine built" | "Planned" }[] = [
  { title: "Plain-English generation", body: "Describe a task and the model drafts a workflow. It is validated before it appears and never runs on its own.", status: "Live" },
  { title: "Visual step editor", body: "Add, remove, reorder, and configure steps. Problems are flagged on the step that has them.", status: "Live" },
  { title: "Real execution engine", body: "Steps run on the server in order. Each one records its input, output, duration, and any error.", status: "Live" },
  { title: "Conditions and transforms", body: "Stop or skip steps based on a result, and reshape data with a fixed set of safe operations.", status: "Live" },
  { title: "Usage and cost per run", body: "Token counts and an estimated cost for every run, with daily limits enforced on the server.", status: "Live" },
  { title: "Human approval", body: "The engine can pause a run and resume it after approval. The review screen needs accounts.", status: "Engine built" },
  { title: "Saved workflows and run history", body: "Accounts, a database, and private per-user records.", status: "Planned" },
  { title: "Template library and integrations", body: "Three starter workflows are available now. The full library and external integrations are not built yet.", status: "Planned" },
];

export default function Home() {
  const steps = DEFAULT_SAMPLE.workflow.steps;
  return (
    <main>
      <section className="bg-grid border-b border-line">
        <div className="mx-auto max-w-6xl px-5 pb-16 pt-16 sm:pt-24">
          <h1 className="max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
            Describe an automation. Edit it. Run it.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
            AgentFlow turns a plain-English request into a workflow you can change step by step, then runs it on a real execution engine and shows you what every step did.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/demo" className={cn(buttonVariants({ variant: "primary", size: "lg" }))}>
              Try the live demo <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link href="/dashboard" className={cn(buttonVariants({ variant: "secondary", size: "lg" }))}>Open app</Link>
          </div>
          <p className="mt-3 text-sm text-faint">No account needed. The demo has a daily limit per visitor.</p>

          <div className="mt-14">
            <p className="mb-3 text-sm text-muted">The sample workflow in the demo: {DEFAULT_SAMPLE.workflow.name}</p>
            <ol className="flex gap-0 overflow-x-auto pb-2">
              {steps.map((s, i) => (
                <li key={s.id} className="flex shrink-0 items-stretch">
                  <div className="w-36 rounded-xl border border-line bg-surface p-3">
                    <p className="text-sm font-medium leading-snug">{s.name}</p>
                    <p className="mt-1 text-xs text-faint">{STEP_LABELS[s.type]}</p>
                    <p className="mt-3 border-t border-line pt-2 font-mono text-xs text-brand">{outputKind(s)}</p>
                  </div>
                  {i < steps.length - 1 && <div className="flex w-4 items-center" aria-hidden><div className="h-px w-full bg-line-strong" /></div>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl scroll-mt-16 px-5 py-16">
        <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
        <ol className="mt-8 grid gap-6 md:grid-cols-3">
          {[
            ["1. Describe", "Write what you want automated. The server asks a real model for a structured workflow and rejects anything that fails validation."],
            ["2. Review and edit", "Every step is editable. Reorder them, change prompts, add a condition, and watch the data that passes from step to step."],
            ["3. Run and inspect", "The engine runs one step at a time on the server. You see each step's status, output, duration, tokens, and errors. A failed step fails the run."],
          ].map(([t, b]) => (
            <li key={t}>
              <h3 className="font-medium">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{b}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="examples" className="mx-auto max-w-6xl scroll-mt-16 border-t border-line px-5 py-16">
        <h2 className="text-2xl font-semibold tracking-tight">Example workflows</h2>
        <p className="mt-2 max-w-xl text-sm text-muted">Each one opens in the demo and runs as written.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {SAMPLES.map((s) => (
            <Card key={s.slug} className="flex flex-col p-5">
              <h3 className="font-medium">{s.workflow.name}</h3>
              <p className="mt-1.5 text-sm text-muted">{s.summary}</p>
              <ul className="mt-4 flex-1 space-y-1 text-xs text-faint">
                {s.workflow.steps.slice(1).map((st) => <li key={st.id}>{st.name}</li>)}
              </ul>
              <Link href={`/demo?sample=${s.slug}`} className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline">
                Open in the demo <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl border-t border-line px-5 py-16">
        <h2 className="text-2xl font-semibold tracking-tight">What works today</h2>
        <p className="mt-2 max-w-xl text-sm text-muted">Every item is labeled with its real status.</p>
        <div className="mt-8 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-surface p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-medium">{f.title}</h3>
                <Badge tone={f.status === "Live" ? "ok" : f.status === "Engine built" ? "accent" : "neutral"}>{f.status}</Badge>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
