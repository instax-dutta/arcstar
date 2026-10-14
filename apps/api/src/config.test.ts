import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("uses defaults for development", () => {
    expect(loadConfig({})).toMatchObject({
      nodeEnv: "development",
      port: 8787,
      databaseUrl: undefined,
      corsOrigins: ["http://localhost:5173"],
    });
  });

  it("parses ports and normalizes production", () => {
    const config = loadConfig({ PORT: "9000", NODE_ENV: "production", DATABASE_URL: "postgres://x" });
    expect(config.port).toBe(9000);
    expect(config.nodeEnv).toBe("production");
    expect(config.databaseUrl).toBe("postgres://x");
    expect(config.corsOrigins).toEqual([]);
  });

  it("accepts a comma separated CORS allowlist", () => {
    expect(loadConfig({ CORS_ALLOWED_ORIGINS: "http://a.test, http://b.test" }).corsOrigins).toEqual([
      "http://a.test",
      "http://b.test",
    ]);
  });

  it("rejects malformed ports", () => {
    expect(() => loadConfig({ PORT: "abc" })).toThrow(/PORT/);
  });

  it("rejects malformed CORS origins", () => {
    expect(() => loadConfig({ CORS_ALLOWED_ORIGINS: "localhost:5173" })).toThrow(/CORS_ALLOWED_ORIGINS/);
  });
});
