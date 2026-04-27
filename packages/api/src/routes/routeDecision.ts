import { Router } from "express";
import { routeRequestSchema } from "../types/schemas.js";
import { resolveClient } from "../services/clientResolver.js";
import { resolveRoute } from "../services/routing.js";
import type { FileStore } from "../storage/fileStore.js";
import { requireAdminToken } from "./_auth.js";

export function routeDecisionRouter(store: FileStore): Router {
  const router = Router();

  router.post("/route/preview", requireAdminToken, async (req, res, next) => {
    try {
      const parsed = routeRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
        return;
      }

      const request = parsed.data;
      const client = await resolveClient(store, {
        clientId: request.clientId,
        clientSlug: request.clientSlug
      });

      if (!client) {
        res.status(404).json({ error: "Client not found" });
        return;
      }

      const decision = resolveRoute(client, {
        service: request.service,
        zip: request.zip,
        lat: request.lat,
        lng: request.lng
      });

      res.json({
        client: {
          id: client.id,
          slug: client.slug,
          clientName: client.clientName
        },
        decision,
        stage: request.stage,
        pluginEnabled: request.stage ? Boolean(client.pluginToggles[request.stage]) : undefined
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
