import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import type { GhlClient } from "../services/ghlClient.js";
import { resolveClient } from "../services/clientResolver.js";
import { resolveRoute } from "../services/routing.js";
import type { FileStore } from "../storage/fileStore.js";
import { estimateWebhookSchema, jobWebhookSchema, leadWebhookSchema, retellWebhookSchema, statusWebhookSchema } from "../types/schemas.js";
import { getIdempotencyKey, requireWebhookSecret } from "./_auth.js";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

const estimateStageByStatus = {
  sent: "Estimate Sent",
  accepted: "Won",
  declined: "Lost"
} as const;

const jobStageByStatus = {
  scheduled: "Job Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled"
} as const;

export function webhooksRouter(store: FileStore, ghlClient: GhlClient): Router {
  const router = Router();

  router.post("/webhooks/lead", requireWebhookSecret, async (req, res, next) => {
    try {
      const parsed = leadWebhookSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
        return;
      }

      const payload = parsed.data;
      const client = await resolveClient(store, {
        clientId: payload.clientId,
        clientSlug: payload.clientSlug
      });

      if (!client) {
        res.status(404).json({ error: "Client not found" });
        return;
      }

      const idempotencyKey =
        req.header("x-idempotency-key") ??
        ([payload.externalLeadId, payload.source, payload.phone, payload.email].filter(Boolean).join("|") ||
          getIdempotencyKey(req));

      const existing = await store.findEventByIdempotencyKey(client.id, "lead", idempotencyKey);
      if (existing) {
        res.json({ duplicate: true, event: existing });
        return;
      }

      const service = payload.serviceRequested ?? client.services[0];
      const routeDecision = service
        ? resolveRoute(client, {
            service,
            zip: payload.zip,
            lat: payload.lat,
            lng: payload.lng
          })
        : { matched: false, reason: "No service provided" };

      const ghlResult = await ghlClient.upsertLead({
        subAccountId: client.ghlSubAccountId,
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email,
        phone: payload.phone,
        source: payload.source,
        serviceRequested: payload.serviceRequested,
        zip: payload.zip,
        externalLeadId: payload.externalLeadId,
        routedCalendarId: routeDecision.matched ? routeDecision.calendar?.ghlCalendarId : undefined,
        fieldMappings: client.ghlFieldMappings,
        metadata: payload.metadata
      });

      const lead = {
        id: uuidv4(),
        clientId: client.id,
        source: payload.source,
        externalLeadId: payload.externalLeadId,
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email,
        phone: payload.phone,
        serviceRequested: payload.serviceRequested,
        zip: payload.zip,
        lat: payload.lat,
        lng: payload.lng,
        routedCalendarId: routeDecision.calendar?.ghlCalendarId,
        ghlContactId: ghlResult.contactId,
        ghlOpportunityId: ghlResult.opportunityId,
        createdAt: new Date().toISOString(),
        metadata: payload.metadata
      };

      await store.addLead(lead);

      await ghlClient.triggerWorkflow({
        contactId: ghlResult.contactId,
        opportunityId: ghlResult.opportunityId,
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email,
        phone: payload.phone,
        serviceRequested: payload.serviceRequested,
        zip: payload.zip,
        source: payload.source,
        routedCalendarId: routeDecision.calendar?.ghlCalendarId,
        routeMatched: routeDecision.matched,
        routeReason: routeDecision.reason,
        leadId: lead.id,
        ...payload.metadata
      });

      const result = {
        routeDecision,
        ghl: ghlResult,
        pluginEnabled: client.pluginToggles["New Lead"] ?? false,
        leadId: lead.id
      };

      const event = await store.createEvent({
        idempotencyKey,
        clientId: client.id,
        eventType: "lead",
        status: "processed",
        payload: payload as Record<string, unknown>,
        result,
        receivedAt: new Date().toISOString()
      });

      res.status(202).json({ accepted: true, event, result });
    } catch (error) {
      next(error);
    }
  });

  router.post("/webhooks/status", requireWebhookSecret, async (req, res, next) => {
    try {
      const parsed = statusWebhookSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
        return;
      }

      const payload = parsed.data;
      const client = await resolveClient(store, {
        clientId: payload.clientId,
        clientSlug: payload.clientSlug
      });

      if (!client) {
        res.status(404).json({ error: "Client not found" });
        return;
      }

      const idempotencyKey =
        req.header("x-idempotency-key") ??
        ([payload.externalContactId, payload.externalStage].filter(Boolean).join("|") || getIdempotencyKey(req));

      const existing = await store.findEventByIdempotencyKey(client.id, "status", idempotencyKey);
      if (existing) {
        res.json({ duplicate: true, event: existing });
        return;
      }

      const mapping = client.stageMappings.find(
        (entry) => normalize(entry.externalStage) === normalize(payload.externalStage)
      );

      if (!mapping || !mapping.enabled) {
        const rejectedEvent = await store.createEvent({
          idempotencyKey,
          clientId: client.id,
          eventType: "status",
          status: "rejected",
          payload: payload as Record<string, unknown>,
          result: {
            reason: mapping ? "Mapping disabled" : "No mapping for external stage",
            externalStage: payload.externalStage
          },
          receivedAt: new Date().toISOString()
        });

        res.status(202).json({ accepted: false, event: rejectedEvent });
        return;
      }

      const pluginEnabled = client.pluginToggles[mapping.ghlStage] ?? false;

      const ghl = pluginEnabled
        ? await ghlClient.updateStage({
            subAccountId: client.ghlSubAccountId,
            externalContactId: payload.externalContactId,
            stage: mapping.ghlStage,
            payload: payload.payload
          })
        : undefined;

      const result = {
        mappedStage: mapping.ghlStage,
        pluginEnabled,
        ghl
      };

      const event = await store.createEvent({
        idempotencyKey,
        clientId: client.id,
        eventType: "status",
        status: "processed",
        payload: payload as Record<string, unknown>,
        result,
        receivedAt: new Date().toISOString()
      });

      res.status(202).json({ accepted: true, event, result });
    } catch (error) {
      next(error);
    }
  });

  router.post("/webhooks/estimate", requireWebhookSecret, async (req, res, next) => {
    try {
      const parsed = estimateWebhookSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
        return;
      }

      const payload = parsed.data;
      const client = await resolveClient(store, {
        clientId: payload.clientId,
        clientSlug: payload.clientSlug
      });

      if (!client) {
        res.status(404).json({ error: "Client not found" });
        return;
      }

      const mappedStage = estimateStageByStatus[payload.estimateStatus];
      const idempotencyKey =
        req.header("x-idempotency-key") ??
        ([payload.externalContactId, payload.estimateStatus, payload.declineReason].filter(Boolean).join("|") ||
          getIdempotencyKey(req));

      const existing = await store.findEventByIdempotencyKey(client.id, "estimate", idempotencyKey);
      if (existing) {
        res.json({ duplicate: true, event: existing });
        return;
      }

      const pluginEnabled = client.pluginToggles[mappedStage] ?? false;
      const ghl = pluginEnabled
        ? await ghlClient.updateStage({
            subAccountId: client.ghlSubAccountId,
            externalContactId: payload.externalContactId,
            stage: mappedStage,
            payload: {
              ...payload.payload,
              estimateStatus: payload.estimateStatus,
              declineReason: payload.declineReason,
              amount: payload.amount
            }
          })
        : undefined;

      const result = {
        mappedStage,
        pluginEnabled,
        pricingObjection: normalize(payload.declineReason ?? "") === "price",
        ghl
      };

      const event = await store.createEvent({
        idempotencyKey,
        clientId: client.id,
        eventType: "estimate",
        status: "processed",
        payload: payload as Record<string, unknown>,
        result,
        receivedAt: new Date().toISOString()
      });

      res.status(202).json({ accepted: true, event, result });
    } catch (error) {
      next(error);
    }
  });

  router.post("/webhooks/job", requireWebhookSecret, async (req, res, next) => {
    try {
      const parsed = jobWebhookSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
        return;
      }

      const payload = parsed.data;
      const client = await resolveClient(store, {
        clientId: payload.clientId,
        clientSlug: payload.clientSlug
      });

      if (!client) {
        res.status(404).json({ error: "Client not found" });
        return;
      }

      const mappedStage = jobStageByStatus[payload.jobStatus];
      const idempotencyKey =
        req.header("x-idempotency-key") ??
        ([payload.externalContactId, payload.jobStatus, payload.scheduledAt].filter(Boolean).join("|") ||
          getIdempotencyKey(req));

      const existing = await store.findEventByIdempotencyKey(client.id, "job", idempotencyKey);
      if (existing) {
        res.json({ duplicate: true, event: existing });
        return;
      }

      const pluginEnabled = client.pluginToggles[mappedStage] ?? false;
      const ghl = pluginEnabled
        ? await ghlClient.updateStage({
            subAccountId: client.ghlSubAccountId,
            externalContactId: payload.externalContactId,
            stage: mappedStage,
            payload: {
              ...payload.payload,
              jobStatus: payload.jobStatus,
              scheduledAt: payload.scheduledAt
            }
          })
        : undefined;

      const result = {
        mappedStage,
        pluginEnabled,
        ghl
      };

      const event = await store.createEvent({
        idempotencyKey,
        clientId: client.id,
        eventType: "job",
        status: "processed",
        payload: payload as Record<string, unknown>,
        result,
        receivedAt: new Date().toISOString()
      });

      res.status(202).json({ accepted: true, event, result });
    } catch (error) {
      next(error);
    }
  });

  router.post("/webhooks/retell", async (req, res, next) => {
    try {
      const parsed = retellWebhookSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid Retell payload", details: parsed.error.issues });
        return;
      }

      const { call } = parsed.data;

      if (parsed.data.event !== "call_analyzed") {
        res.status(200).json({ skipped: true, event: parsed.data.event });
        return;
      }

      const analysis = call.call_analysis?.custom_analysis_data ?? {};
      const getString = (keys: string[]): string | undefined => {
        for (const key of keys) {
          const val = analysis[key];
          if (typeof val === "string" && val.trim()) return val.trim();
        }
        return undefined;
      };

      const firstName = getString(["first_name", "firstName"]);
      const lastName = getString(["last_name", "lastName"]);
      const phone = getString(["phone", "phone_number"]) ?? call.from_number;
      const email = getString(["email"]);
      const serviceRequested = getString(["service_requested", "serviceRequested", "service"]);
      const zip = getString(["zip_code", "zip", "postal_code"]);
      const clientSlug = String(call.metadata?.client_slug ?? "multiply_talents");

      const client = await resolveClient(store, { clientSlug });
      if (!client) {
        res.status(404).json({ error: "Client not found", clientSlug });
        return;
      }

      const idempotencyKey = call.call_id;
      const existing = await store.findEventByIdempotencyKey(client.id, "lead", idempotencyKey);
      if (existing) {
        res.json({ duplicate: true, event: existing });
        return;
      }

      const service = serviceRequested ?? client.services[0];
      const routeDecision = service
        ? resolveRoute(client, { service, zip })
        : { matched: false, reason: "No service identified from call" };

      const ghlResult = await ghlClient.upsertLead({
        subAccountId: client.ghlSubAccountId,
        firstName,
        lastName,
        email,
        phone,
        source: "retell_ai",
        serviceRequested: service,
        zip,
        externalLeadId: call.call_id,
        routedCalendarId: routeDecision.matched ? routeDecision.calendar?.ghlCalendarId : undefined,
        fieldMappings: client.ghlFieldMappings,
        metadata: {
          call_direction: call.direction ?? "inbound",
          call_transcript: call.transcript,
          call_summary: call.call_analysis?.call_summary,
          retell_call_id: call.call_id
        }
      });

      const lead = {
        id: uuidv4(),
        clientId: client.id,
        source: "retell_ai",
        externalLeadId: call.call_id,
        firstName,
        lastName,
        email,
        phone,
        serviceRequested: service,
        zip,
        routedCalendarId: routeDecision.calendar?.ghlCalendarId,
        ghlContactId: ghlResult.contactId,
        ghlOpportunityId: ghlResult.opportunityId,
        createdAt: new Date().toISOString(),
        metadata: { retell_call_id: call.call_id, ...analysis }
      };

      await store.addLead(lead);

      await ghlClient.triggerWorkflow({
        contactId: ghlResult.contactId,
        opportunityId: ghlResult.opportunityId,
        leadId: lead.id,
        firstName,
        lastName,
        email,
        phone,
        serviceRequested: service,
        zip,
        source: "retell_ai",
        routedCalendarId: routeDecision.calendar?.ghlCalendarId,
        routeMatched: routeDecision.matched,
        callTranscript: call.transcript,
        callSummary: call.call_analysis?.call_summary,
        retellCallId: call.call_id
      });

      const result = { routeDecision, ghl: ghlResult, leadId: lead.id };

      const event = await store.createEvent({
        idempotencyKey,
        clientId: client.id,
        eventType: "lead",
        status: "processed",
        payload: req.body as Record<string, unknown>,
        result,
        receivedAt: new Date().toISOString()
      });

      res.status(202).json({ accepted: true, event, result });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
