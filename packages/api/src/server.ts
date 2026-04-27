import type express from "express";
import { createApp } from "./app.js";
import { env } from "./config.js";
import { logger } from "./logger.js";
import { GhlClient } from "./services/ghlClient.js";
import { FileStore } from "./storage/fileStore.js";

let appPromise: Promise<express.Express> | undefined;

// Shared by the local Node server and the Vercel serverless adapter.
export async function createServerApp(): Promise<express.Express> {
  const store = new FileStore();
  await store.init();

  return createApp({
    store,
    ghlClient: new GhlClient()
  });
}

export function getServerApp(): Promise<express.Express> {
  appPromise ??= createServerApp();
  return appPromise;
}

export async function listen(): Promise<void> {
  const app = await getServerApp();

  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "Middleware API listening");
  });
}
