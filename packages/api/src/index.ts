import { logger } from "./logger.js";
import { listen } from "./server.js";

listen().catch((error) => {
  logger.error({ err: error }, "Failed to bootstrap API");
  process.exit(1);
});
