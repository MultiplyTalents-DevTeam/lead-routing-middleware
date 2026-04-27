import { env } from "./config.js";
import { logger } from "./logger.js";
import { createApp } from "./app.js";
import { GhlClient } from "./services/ghlClient.js";
import { FileStore } from "./storage/fileStore.js";

async function bootstrap(): Promise<void> {
  const store = new FileStore();
  await store.init();

  const ghlClient = new GhlClient();
  const app = createApp({ store, ghlClient });

  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "Middleware API listening");
  });
}

bootstrap().catch((error) => {
  logger.error({ err: error }, "Failed to bootstrap API");
  process.exit(1);
});
