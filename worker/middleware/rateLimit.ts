import { createMiddleware } from "hono/factory";
import type { AppBindings } from "../types";
import { Errors } from "../lib/errors";

// Best-effort per-isolate sliding window limiter. Workers isolates are
// ephemeral and distributed across edge locations, so this does not provide
// a global guarantee — it exists as defense-in-depth against a single
// abusive client hammering one isolate. For a hard global limit, add a
// Cloudflare dashboard Rate Limiting rule in front of /api/* (see docs/ops.md).
const buckets = new Map<string, number[]>();
const WINDOW_MS = 60_000;

export function rateLimit(limitPerMinute: number) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const ip = c.req.header("cf-connecting-ip") ?? "unknown";
    const key = `${ip}:${c.req.path}`;
    const now = Date.now();
    const hits = (buckets.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
    if (hits.length >= limitPerMinute) {
      throw Errors.tooManyRequests();
    }
    hits.push(now);
    buckets.set(key, hits);
    await next();
  });
}
