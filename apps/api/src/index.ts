import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig(process.env);
serve({ fetch: app.fetch, port: config.port });
if (config.databaseUrl !== undefined) {
  console.warn("DATABASE_URL is set but persistence repositories are not wired into HTTP routes yet.");
}
console.warn(`arcstar api listening on http://localhost:${config.port}`);
