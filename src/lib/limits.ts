import { createHash } from "node:crypto";

/**
 * Stage 1 limiter: counters live in server memory, keyed per UTC day.
 * This is real server-side enforcement, but each serverless instance has its own counters,
 * so on Vercel it is best-effort. Stage 3 replaces it with a database-backed limiter.
 */
type Bucket = { count: number };
const g = globalThis as unknown as { __afLimits?: Map<string, Bucket> };
const store = (g.__afLimits ??= new Map<string, Bucket>());

const day = () => new Date().toISOString().slice(0, 10);

export interface LimitResult {
  ok: boolean;
  remaining: number;
  limit: number;
}

export function consume(key: string, limit: number): LimitResult {
  const d = day();
  const full = `${d}:${key}`;
  if (store.size > 5000) {
    for (const k of store.keys()) if (!k.startsWith(d)) store.delete(k);
  }
  const bucket = store.get(full) ?? { count: 0 };
  if (bucket.count >= limit) return { ok: false, remaining: 0, limit };
  bucket.count++;
  store.set(full, bucket);
  return { ok: true, remaining: limit - bucket.count, limit };
}

export function peek(key: string, limit: number): LimitResult {
  const used = store.get(`${day()}:${key}`)?.count ?? 0;
  return { ok: used < limit, remaining: Math.max(0, limit - used), limit };
}

/** A stable, anonymous identifier for a visitor. The raw IP address is never stored. */
export function visitorKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = fwd || req.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`agentflow:${ip}`).digest("hex").slice(0, 24);
}
