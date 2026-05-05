import { z } from "zod";

const timezoneRegex = /^[A-Za-z_]+\/[A-Za-z_]+$/;

export const polygonPointSchema = z.object({
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180)
});

const areaModeSchema = z.enum(["NONE", "ZIP_LIST", "GEOFENCE_MI", "POLYGON"]);

export const serviceAreaSchema = z
  .object({
    mode: areaModeSchema,
    zipCodes: z.array(z.string().trim().min(2)).default([]),
    geofence: z
      .object({
        centerLat: z.number().gte(-90).lte(90),
        centerLng: z.number().gte(-180).lte(180),
        radiusMi: z.number().gt(0).lte(500)
      })
      .optional(),
    polygonPoints: z.array(polygonPointSchema).default([])
  })
  .superRefine((value, ctx) => {
    if (value.mode === "ZIP_LIST" && value.zipCodes.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ZIP_LIST mode requires at least one zip code"
      });
    }

    if (value.mode === "GEOFENCE_MI" && !value.geofence) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "GEOFENCE_MI mode requires geofence settings"
      });
    }

    if (value.mode === "POLYGON" && value.polygonPoints.length < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "POLYGON mode requires at least 3 points"
      });
    }
  });

export const calendarRouteSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(120),
  ghlCalendarId: z.string().trim().min(2).max(120),
  services: z.array(z.string().trim().min(1)).min(1),
  area: serviceAreaSchema
});

export const customQuestionSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(120),
  key: z.string().trim().min(1).max(80),
  required: z.boolean()
});

export const autoFieldSchema = z.object({
  key: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  required: z.boolean()
});

export const stageMappingSchema = z.object({
  id: z.string().uuid(),
  externalStage: z.string().trim().min(1).max(120),
  ghlStage: z.string().trim().min(1).max(120),
  enabled: z.boolean()
});

export const ghlFieldMappingsSchema = z
  .object({
    leadSource: z.string().trim().optional(),
    serviceRequest: z.string().trim().optional(),
    serviceRequested: z.string().trim().optional(),
    serviceAreaZip: z.string().trim().optional(),
    locationBranch: z.string().trim().optional(),
    assignedRep: z.string().trim().optional(),
    estimateStatus: z.string().trim().optional(),
    declineReason: z.string().trim().optional(),
    lastJobType: z.string().trim().optional(),
    routedCalendarId: z.string().trim().optional(),
    callDirection: z.string().trim().optional(),
    callTranscript: z.string().trim().optional(),
    externalLeadId: z.string().trim().optional()
  })
  .default({});

export const clientConfigSchema = z.object({
  id: z.string().uuid(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9_-]+$/, "Slug must only use lowercase letters, numbers, dashes, or underscores"),
  clientName: z.string().trim().min(2).max(120),
  ghlSubAccountId: z.string().trim().min(2).max(120),
  connectedCrm: z.string().trim().min(2).max(120),
  timezone: z.string().trim().regex(timezoneRegex, "Timezone must look like Region/City"),
  industries: z.array(z.string().trim().min(2)).min(1),
  businessUnits: z.array(z.string().trim().min(2)).min(1),
  services: z.array(z.string().trim().min(2)).min(1),
  calendarRoutes: z.array(calendarRouteSchema).min(1),
  customQuestions: z.array(customQuestionSchema),
  autoFields: z.array(autoFieldSchema).min(1),
  stageMappings: z.array(stageMappingSchema).min(1),
  pluginToggles: z.record(z.string().trim().min(1), z.boolean()),
  ghlFieldMappings: ghlFieldMappingsSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const clientConfigUpsertSchema = clientConfigSchema.omit({
  createdAt: true,
  updatedAt: true,
  id: true
});

export const routeRequestSchema = z.object({
  clientId: z.string().uuid().optional(),
  clientSlug: z.string().trim().toLowerCase().optional(),
  service: z.string().trim().min(1),
  zip: z.string().trim().optional(),
  lat: z.number().gte(-90).lte(90).optional(),
  lng: z.number().gte(-180).lte(180).optional(),
  stage: z.string().trim().optional()
});

export const leadWebhookSchema = z.object({
  clientId: z.string().uuid().optional(),
  clientSlug: z.string().trim().toLowerCase().optional(),
  externalLeadId: z.string().trim().optional(),
  source: z.string().trim().min(2),
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  email: z.string().email().optional(),
  phone: z.string().trim().min(7).optional(),
  serviceRequested: z.string().trim().min(1).optional(),
  zip: z.string().trim().optional(),
  lat: z.number().gte(-90).lte(90).optional(),
  lng: z.number().gte(-180).lte(180).optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const statusWebhookSchema = z.object({
  clientId: z.string().uuid().optional(),
  clientSlug: z.string().trim().toLowerCase().optional(),
  externalContactId: z.string().trim().optional(),
  externalStage: z.string().trim().min(1),
  payload: z.record(z.string(), z.unknown()).default({})
});

export const estimateWebhookSchema = z.object({
  clientId: z.string().uuid().optional(),
  clientSlug: z.string().trim().toLowerCase().optional(),
  externalContactId: z.string().trim().optional(),
  estimateStatus: z.enum(["sent", "accepted", "declined"]),
  declineReason: z.string().trim().optional(),
  amount: z.number().positive().optional(),
  payload: z.record(z.string(), z.unknown()).default({})
});

export const jobWebhookSchema = z.object({
  clientId: z.string().uuid().optional(),
  clientSlug: z.string().trim().toLowerCase().optional(),
  externalContactId: z.string().trim().optional(),
  jobStatus: z.enum(["scheduled", "in_progress", "completed", "cancelled"]),
  scheduledAt: z.string().datetime().optional(),
  payload: z.record(z.string(), z.unknown()).default({})
});

export const retellWebhookSchema = z.object({
  event: z.string(),
  call: z.object({
    call_id: z.string(),
    from_number: z.string().optional(),
    to_number: z.string().optional(),
    direction: z.string().optional(),
    transcript: z.string().optional(),
    call_analysis: z
      .object({
        call_summary: z.string().optional(),
        custom_analysis_data: z.record(z.string(), z.unknown()).optional()
      })
      .optional(),
    metadata: z.record(z.string(), z.unknown()).optional()
  })
});

export const clientLookupSchema = z
  .object({
    clientId: z.string().uuid().optional(),
    clientSlug: z.string().trim().toLowerCase().optional()
  })
  .superRefine((value, ctx) => {
    if (!value.clientId && !value.clientSlug) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either clientId or clientSlug must be supplied"
      });
    }
  });
