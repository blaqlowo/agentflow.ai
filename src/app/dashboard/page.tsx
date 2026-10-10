import Link from "next/link";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getEnvStatus } from "@/lib/env";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard | AgentFlow AI" };
export const dynamic = "force-dynamic";

const STATS = ["Workflows", "Successful runs", "Failed runs", "AI usage and estimated cost"];

export default function Dashboard() {
  const env = getEnvStatus();
  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted">Totals from your saved workflows and runs.</p>
        </div>
        <Link href="/demo" className={cn(buttonVariants({ variant: "primary" }))}>Create workflow</Link>
      </div>

      <Card className="mt-8 border-warn/30">
        <CardHeader>
          <div className="flex items-center gap-3">
            <CardTitle>Accounts and saved data are not built yet</CardTitle>
            <Badge tone="warn">Not implemented</Badge>
          </div>
          <CardDescription>
            This page will show real totals once sign-in and the database are added. Until then it shows no numbers rather than invented ones. Workflows in the demo are not saved.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted">
          Database and auth configuration on this server:{" "}
          <span className={env.supabase ? "text-ok" : "text-faint"}>{env.supabase ? "Supabase keys are set" : "Supabase keys are not set"}</span>.
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map((s) => (
          <Card key={s} className="p-5">
            <p className="text-sm text-muted">{s}</p>
            <p className="mt-2 text-2xl font-semibold text-faint">No data</p>
          </Card>
        ))}
      </div>

      <Card className="mt-6 p-5">
        <h2 className="font-medium">Recent activity</h2>
        <p className="mt-2 text-sm text-muted">Nothing yet. Runs will be listed here after accounts are added.</p>
      </Card>
    </main>
  );
}
