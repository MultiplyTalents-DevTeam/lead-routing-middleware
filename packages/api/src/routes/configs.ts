import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { ZodError } from "zod";
import { requireAdminToken } from "./_auth.js";
import { clientConfigUpsertSchema } from "../types/schemas.js";
import type { Store } from "../storage/store.js";

function formatZodError(error: ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`);
}

function readParamId(rawId: string | string[] | undefined): string | undefined {
  if (Array.isArray(rawId)) {
    return rawId[0];
  }

  return rawId;
}

export function configsRouter(store: Store): Router {
  const router = Router();

  router.get("/configs", requireAdminToken, async (_req, res, next) => {
    try {
      const clients = await store.listClients();
      res.json({ clients });
    } catch (error) {
      next(error);
    }
  });

  router.get("/configs/:id", requireAdminToken, async (req, res, next) => {
    try {
      const id = readParamId(req.params.id);
      if (!id) {
        res.status(400).json({ error: "Missing config id" });
        return;
      }

      const client = await store.getClientById(id);
      if (!client) {
        res.status(404).json({ error: "Client config not found" });
        return;
      }

      res.json({ client });
    } catch (error) {
      next(error);
    }
  });

  router.post("/configs", requireAdminToken, async (req, res, next) => {
    try {
      const parsed = clientConfigUpsertSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Validation failed", details: formatZodError(parsed.error) });
        return;
      }

      const now = new Date().toISOString();
      const incoming = parsed.data;
      const existingSlug = await store.getClientBySlug(incoming.slug);
      if (existingSlug) {
        res.status(409).json({ error: `Slug '${incoming.slug}' already exists` });
        return;
      }

      const newConfig = {
        ...incoming,
        id: uuidv4(),
        createdAt: now,
        updatedAt: now
      };

      const saved = await store.upsertClient(newConfig);
      res.status(201).json({ client: saved });
    } catch (error) {
      next(error);
    }
  });

  router.put("/configs/:id", requireAdminToken, async (req, res, next) => {
    try {
      const id = readParamId(req.params.id);
      if (!id) {
        res.status(400).json({ error: "Missing config id" });
        return;
      }

      const current = await store.getClientById(id);
      if (!current) {
        res.status(404).json({ error: "Client config not found" });
        return;
      }

      const parsed = clientConfigUpsertSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Validation failed", details: formatZodError(parsed.error) });
        return;
      }

      const incoming = parsed.data;
      if (incoming.slug !== current.slug) {
        const slugOwner = await store.getClientBySlug(incoming.slug);
        if (slugOwner && slugOwner.id !== current.id) {
          res.status(409).json({ error: `Slug '${incoming.slug}' already exists` });
          return;
        }
      }

      const updated = {
        ...incoming,
        id: current.id,
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString()
      };

      const saved = await store.upsertClient(updated);
      res.json({ client: saved });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/configs/:id", requireAdminToken, async (req, res, next) => {
    try {
      const id = readParamId(req.params.id);
      if (!id) {
        res.status(400).json({ error: "Missing config id" });
        return;
      }

      const removed = await store.removeClient(id);
      if (!removed) {
        res.status(404).json({ error: "Client config not found" });
        return;
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.get("/events", requireAdminToken, async (req, res, next) => {
    try {
      const limit = Number(req.query.limit ?? "200");
      const events = await store.listEvents(Math.min(Math.max(limit, 1), 1000));
      res.json({ events });
    } catch (error) {
      next(error);
    }
  });

  router.get("/leads", requireAdminToken, async (req, res, next) => {
    try {
      const limit = Number(req.query.limit ?? "100");
      const leads = await store.listLeads(Math.min(Math.max(limit, 1), 1000));
      res.json({ leads });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
