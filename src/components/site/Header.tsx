import Link from "next/link";
import { Workflow } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-brand/15 text-brand">
            <Workflow className="h-4 w-4" aria-hidden />
          </span>
          AgentFlow AI
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/#how" className="hidden rounded-md px-3 py-1.5 text-muted hover:text-fg sm:block">How it works</Link>
          <Link href="/#examples" className="hidden rounded-md px-3 py-1.5 text-muted hover:text-fg sm:block">Examples</Link>
          <Link href="/dashboard" className="rounded-md px-3 py-1.5 text-muted hover:text-fg">Open app</Link>
          <Link href="/demo" className={cn(buttonVariants({ variant: "primary", size: "sm" }), "ml-1")}>Try the demo</Link>
        </nav>
      </div>
    </header>
  );
}
