import { serve } from "@hono/node-server";
import { app, defaultDataLayer } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig(process.env);

async function start(): Promise<void> {
  await defaultDataLayer.ready?.();

  const server = serve({ fetch: app.fetch, port: config.port });

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.close(async () => {
      await defaultDataLayer.close?.();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => void shutdown());
  }
}

void start();
