import type { Request, Response, NextFunction } from "express";
import { env } from "../config.js";

export function requireAdminToken(req: Request, res: Response, next: NextFunction): void {
  const token = req.header("x-admin-token");
  if (!token || token !== env.ADMIN_TOKEN) {
    res.status(401).json({ error: "Unauthorized: invalid admin token" });
    return;
  }
  next();
}

export function requireWebhookSecret(req: Request, res: Response, next: NextFunction): void {
  const secret = req.header("x-webhook-secret");
  if (!secret || secret !== env.WEBHOOK_SECRET) {
    res.status(401).json({ error: "Unauthorized: invalid webhook secret" });
    return;
  }
  next();
}

export function getIdempotencyKey(req: Request): string {
  const headerKey = req.header("x-idempotency-key");
  if (headerKey && headerKey.trim().length > 0) {
    return headerKey.trim();
  }

  return `fallback:${JSON.stringify(req.body)}`;
}
