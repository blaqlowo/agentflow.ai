export type EnvStatus = {
  anthropic: boolean;
  supabase: boolean;
  missing: string[];
};

const ANTHROPIC = ["ANTHROPIC_API_KEY"];
const SUPABASE = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];

export const isProd = process.env.NODE_ENV === "production";

export function getEnvStatus(): EnvStatus {
  const missing = [...ANTHROPIC, ...SUPABASE].filter((k) => !process.env[k]);
  return {
    anthropic: ANTHROPIC.every((k) => !missing.includes(k)),
    supabase: SUPABASE.every((k) => !missing.includes(k)),
    missing,
  };
}

export function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw === undefined || raw === "" ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export const aiModel = () => process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";

export const pricing = () => ({
  inputPerMTok: numEnv("AI_INPUT_COST_PER_MTOK", 1),
  outputPerMTok: numEnv("AI_OUTPUT_COST_PER_MTOK", 5),
});

export const demoLimits = () => ({
  generationsPerDay: numEnv("DEMO_GENERATIONS_PER_DAY", 5),
  aiCallsPerDay: numEnv("DEMO_AI_CALLS_PER_DAY", 20),
  globalAiCallsPerDay: numEnv("DEMO_GLOBAL_AI_CALLS_PER_DAY", 300),
  stepCallsPerDay: 400,
});

export const SETUP_MESSAGE =
  "The AI provider is not configured on this server. Set ANTHROPIC_API_KEY in the environment (see the README) and restart.";
