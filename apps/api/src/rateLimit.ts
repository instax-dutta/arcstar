import type { MiddlewareHandler } from "hono";

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  maxKeys?: number;
  now?: () => number;
  trustedProxies?: readonly string[];
}

function immediatePeer(c: Parameters<MiddlewareHandler>[0]): string | undefined {
  const incoming = (c as { env?: { incoming?: { socket?: { remoteAddress?: string } } } }).env?.incoming;
  return incoming?.socket?.remoteAddress;
}

function clientKey(c: Parameters<MiddlewareHandler>[0], trustedProxies: ReadonlySet<string>): string {
  const peer = immediatePeer(c);
  if (peer && trustedProxies.has(peer)) {
    const forwarded = c.req.header("x-forwarded-for");
    const firstForwarded = forwarded?.split(",")[0]?.trim();
    if (firstForwarded) return firstForwarded;
  }

  return peer ?? "anonymous";
}

/**
 * Bounded fixed-window limiter for expensive routes. `maxKeys` keeps memory bounded
 * when many unique clients appear. Forwarded headers are trusted only when the
 * immediate peer is configured as a trusted proxy. Multi-process deployments still
 * need shared state or proxy-level rate limiting.
 */
export function createRateLimiter(options: RateLimitOptions): MiddlewareHandler {
  const windowMs = options.windowMs;
  const maxRequests = options.maxRequests;
  const maxKeys = options.maxKeys ?? 10000;
  const now = options.now ?? Date.now;
  const trustedProxies = new Set(options.trustedProxies ?? []);
  const hits = new Map<string, { count: number; resetAt: number }>();

  return async (c, next) => {
    const timestamp = now();
    const key = clientKey(c, trustedProxies);
    const current = hits.get(key);

    if (!current || current.resetAt <= timestamp) {
      if (hits.size >= maxKeys) {
        const oldest = hits.keys().next().value;
        if (oldest !== undefined) hits.delete(oldest);
      }
      hits.set(key, { count: 1, resetAt: timestamp + windowMs });
    } else {
      current.count += 1;
    }

    const entry = hits.get(key)!;
    if (entry.count > maxRequests) {
      return c.json({ error: "rate limit exceeded" }, 429);
    }

    await next();
  };
}
