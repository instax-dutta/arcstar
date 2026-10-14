export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  port: number;
  databaseUrl?: string;
  corsOrigins: string[];
}

function parseOrigins(env: Record<string, string | undefined>, nodeEnv: AppConfig["nodeEnv"]): string[] {
  const raw = env.CORS_ALLOWED_ORIGINS ?? (nodeEnv === "production" ? "" : "http://localhost:5173");
  const origins = raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  if (origins.some((origin) => !/^https?:\/\//.test(origin))) {
    throw new Error("CORS_ALLOWED_ORIGINS entries must start with http:// or https://");
  }
  return origins;
}

export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const rawPort = env.PORT ?? "8787";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535, received "${rawPort}"`);
  }

  const rawEnv = env.NODE_ENV ?? "development";
  if (rawEnv !== "development" && rawEnv !== "test" && rawEnv !== "production") {
    throw new Error(`NODE_ENV must be development, test, or production, received "${rawEnv}"`);
  }

  const databaseUrl = env.DATABASE_URL && env.DATABASE_URL.length > 0 ? env.DATABASE_URL : undefined;
  if (databaseUrl !== undefined && !databaseUrl.startsWith("postgres://") && !databaseUrl.startsWith("postgresql://")) {
    throw new Error("DATABASE_URL must be a postgres:// or postgresql:// connection string");
  }

  return { nodeEnv: rawEnv, port, databaseUrl, corsOrigins: parseOrigins(env, rawEnv) };
}
