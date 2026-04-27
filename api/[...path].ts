import type { IncomingMessage, ServerResponse } from "node:http";
import { getServerApp } from "../packages/api/dist/server.js";

// Vercel serverless adapter. The Express app itself lives in packages/api.
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await getServerApp();
  app(req, res);
}
