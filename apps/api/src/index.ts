import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig(process.env);
serve({ fetch: app.fetch, port: config.port });
console.warn(`arcstar api listening on http://localhost:${config.port}`);
