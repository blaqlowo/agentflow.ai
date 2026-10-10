import { NextResponse } from "next/server";
import { aiModel, demoLimits, getEnvStatus, isProd } from "@/lib/env";

export const dynamic = "force-dynamic";

export function GET() {
  const s = getEnvStatus();
  return NextResponse.json({
    ok: s.anthropic,
    anthropic: s.anthropic,
    supabase: s.supabase,
    model: s.anthropic ? aiModel() : null,
    demoLimits: demoLimits(),
    // Variable names are only revealed in local development.
    ...(isProd ? {} : { missing: s.missing }),
  });
}
