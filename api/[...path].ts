import type { IncomingMessage, ServerResponse } from "node:http";
import type express from "express";

let appPromise: Promise<express.Express> | undefined;

async function getApp(): Promise<express.Express> {
  appPromise ??= import("../packages/api/dist/server.js")
    .then((module) => module.getServerApp())
    .catch((error: unknown) => {
      appPromise = undefined;
      throw error;
    });
  return appPromise;
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

// Vercel serverless adapter. The Express app itself lives in packages/api.
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const app = await getApp();
    app(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown API startup error";
    const stack = error instanceof Error ? error.stack : undefined;

    sendJson(res, 500, {
      ok: false,
      error: message,
      stack: process.env.NODE_ENV === "production" ? undefined : stack
    });
  }
}
