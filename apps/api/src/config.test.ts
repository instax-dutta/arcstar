import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("uses defaults for development", () => {
    expect(loadConfig({})).toMatchObject({ nodeEnv: "development", port: 8787, databaseUrl: undefined });
  });

  it("parses ports and normalizes production", () => {
    const config = loadConfig({ PORT: "9000", NODE_ENV: "production", DATABASE_URL: "postgres://x" });
    expect(config.port).toBe(9000);
    expect(config.nodeEnv).toBe("production");
    expect(config.databaseUrl).toBe("postgres://x");
  });

  it("rejects malformed ports", () => {
    expect(() => loadConfig({ PORT: "abc" })).toThrow(/PORT/);
  });
});
