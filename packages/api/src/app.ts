import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { env } from "./config.js";
import { logger } from "./logger.js";
import { GhlClient } from "./services/ghlClient.js";
import type { Store } from "./storage/store.js";
import { configsRouter } from "./routes/configs.js";
import { healthRouter } from "./routes/health.js";
import { routeDecisionRouter } from "./routes/routeDecision.js";
import { webhooksRouter } from "./routes/webhooks.js";

export interface AppDependencies {
  store: Store;
  ghlClient: GhlClient;
}

export function createApp(deps: AppDependencies): express.Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: false
    })
  );

  const adminCors = cors({
    origin: env.CORS_ORIGIN,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "x-admin-token", "x-webhook-secret", "x-idempotency-key"]
  });

  const webhookCors = cors({
    origin: "*",
    methods: ["POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-webhook-secret", "x-idempotency-key"]
  });

  app.use(express.json({ limit: "1mb" }));
  app.use((req, _res, next) => {
    logger.debug({ method: req.method, path: req.path, ip: req.ip }, "Inbound request");
    next();
  });

  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      max: env.NODE_ENV === "production" ? 300 : 1000,
      standardHeaders: "draft-8",
      legacyHeaders: false
    })
  );

  app.use("/api", healthRouter());
  app.use("/api", adminCors, configsRouter(deps.store));
  app.use("/api", adminCors, routeDecisionRouter(deps.store));
  app.use("/api/webhooks", webhookCors);
  app.use("/api", webhooksRouter(deps.store, deps.ghlClient));

  app.use((req, res) => {
    res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : "Unhandled error";
    logger.error({ err: error }, "Unhandled error");
    res.status(500).json({ error: message });
  });

  return app;
}
