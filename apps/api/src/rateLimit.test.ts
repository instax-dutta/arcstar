import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { createRateLimiter } from "./rateLimit.js";

function requestApp(trustedProxies: string[], maxRequests = 1) {
  const app = new Hono();
  app.use("*", createRateLimiter({ windowMs: 60_000, maxRequests, trustedProxies }));
  app.get("/test", (c) => c.json({ ok: true }));
  return app;
}

describe("rate limiter trust boundary", () => {
  it("ignores x-forwarded-for when the immediate peer is not trusted", async () => {
    const app = requestApp(["10.0.0.1"]);
    const first = await app.request("/test", { headers: { "x-forwarded-for": "1.1.1.1" } });
    const second = await app.request("/test", { headers: { "x-forwarded-for": "1.1.1.1" } });
    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  it("trusts x-forwarded-for only from a configured trusted proxy peer", async () => {
    const app = new Hono();
    app.use("*", async (c, next) => {
      Object.assign(c, { env: { incoming: { socket: { remoteAddress: "10.0.0.1" } } } });
      await next();
    });
    app.use("*", createRateLimiter({ windowMs: 60_000, maxRequests: 1, trustedProxies: ["10.0.0.1"] }));
    app.get("/test", (c) => c.json({ ok: true }));
    const first = await app.request("/test", { headers: { "x-forwarded-for": "1.1.1.1" } });
    const second = await app.request("/test", { headers: { "x-forwarded-for": "2.2.2.2" } });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });
});
