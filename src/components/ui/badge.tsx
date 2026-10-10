import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", {
  variants: {
    tone: {
      neutral: "border-line-strong text-muted",
      ok: "border-ok/30 bg-ok/10 text-ok",
      warn: "border-warn/30 bg-warn/10 text-warn",
      bad: "border-bad/30 bg-bad/10 text-bad",
      brand: "border-brand/30 bg-brand/10 text-brand",
      accent: "border-accent/30 bg-accent/10 text-accent",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
