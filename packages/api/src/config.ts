import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const defaultDataFile = process.env.VERCEL ? "/tmp/store.json" : "./data/store.json";
const emptyToUndefined = (value: unknown): unknown => (value === "" ? undefined : value);
const optionalEnvString = z.preprocess(emptyToUndefined, z.string().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  ADMIN_TOKEN: z.string().min(10).default("change-me-admin-token"),
  WEBHOOK_SECRET: z.string().min(10).default("change-me-webhook-secret"),
  DATA_FILE: z.string().default(defaultDataFile),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  GHL_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  GHL_API_KEY: optionalEnvString,
  GHL_API_VERSION: z.string().default("2021-07-28"),
  GHL_PIPELINE_ID: optionalEnvString,
  GHL_PIPELINE_STAGE_ID: optionalEnvString,
  GHL_FIELD_SERVICE_REQUESTED: optionalEnvString,
  GHL_FIELD_ROUTED_CALENDAR_ID: optionalEnvString,
  GHL_FIELD_LEAD_SOURCE: optionalEnvString,
  GHL_FIELD_ZIP_CODE: optionalEnvString,
  GHL_FIELD_CALL_DIRECTION: optionalEnvString,
  GHL_FIELD_CALL_TRANSCRIPT: optionalEnvString,
  GHL_FIELD_EXTERNAL_LEAD_ID: optionalEnvString
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment variables: ${parsed.error.message}`);
}

export const env = parsed.data;
