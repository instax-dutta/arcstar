import { serve } from "@hono/node-server";
import { app, defaultDataLayer } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig(process.env);
serve({ fetch: app.fetch, port: config.port });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void (async () => {
      await defaultDataLayer.close?.();
      process.exit(0);
    })();
  });
}

if (config.databaseUrl !== undefined && defaultDataLayer.storage === "memory") {
  console.warn("DATABASE_URL is set but persistence repositories are not active.");
}
console.warn(`arcstar api listening on http://localhost:${config.port}`);
