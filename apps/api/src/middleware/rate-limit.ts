import { createMiddleware } from "hono/factory";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function rateLimit(opts: { windowMs: number; max: number }) {
  return createMiddleware(async (c, next) => {
    const key = `${c.req.header("x-forwarded-for") ?? "local"}:${c.req.path}`;
    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    c.header("X-RateLimit-Limit", String(opts.max));
    c.header("X-RateLimit-Remaining", String(Math.max(0, opts.max - bucket.count)));

    if (bucket.count > opts.max) {
      return c.json({ error: "rate_limit_exceeded" }, 429);
    }

    await next();
  });
}
