import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  ADMIN_TOKEN: z.string().min(10).default("change-me-admin-token"),
  WEBHOOK_SECRET: z.string().min(10).default("change-me-webhook-secret"),
  DATA_FILE: z.string().default("./data/store.json"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  GHL_BASE_URL: z.string().url().optional(),
  GHL_API_KEY: z.string().optional()
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment variables: ${parsed.error.message}`);
}

export const env = parsed.data;
