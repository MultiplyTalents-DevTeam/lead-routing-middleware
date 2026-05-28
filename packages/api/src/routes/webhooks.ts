import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import type { GhlClient } from "../services/ghlClient.js";
import { resolveClient } from "../services/clientResolver.js";
import { resolveRoute } from "../services/routing.js";
import type { Store } from "../storage/store.js";
import { estimateWebhookSchema, jobWebhookSchema, leadWebhookSchema, retellWebhookSchema, statusWebhookSchema } from "../types/schemas.js";
import { getIdempotencyKey, requireWebhookSecret } from "./_auth.js";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function tagSafe(value: string): string {
  return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function leadTags(clientSlug: string, source: string, service?: string): string[] {
  return [
    "middleware:processed",
    `middleware:client:${tagSafe(clientSlug)}`,
    `middleware:source:${tagSafe(source)}`,
    service ? `middleware:service:${tagSafe(service)}` : undefined
  ].filter((tag): tag is string => Boolean(tag));
}

function retellModeTags(input: {
  appointmentStatus: "booked" | "skipped";
  appointmentConfirmationEnabled: boolean;
  estimateRequested: boolean;
  estimateEnabled: boolean;
}): string[] {
  return [
    input.appointmentStatus === "booked" ? "middleware:appointment-booked" : undefined,
    input.appointmentStatus === "booked" && input.appointmentConfirmationEnabled
      ? "middleware:appointment-confirmed"
      : undefined,
    input.estimateRequested && input.estimateEnabled ? "middleware:estimate-requested" : undefined
  ].filter((tag): tag is string => Boolean(tag));
}

async function safeAddTags(ghlClient: GhlClient, contactId: string, tags: string[]): Promise<Record<string, unknown>> {
  try {
    return (await ghlClient.addTags(contactId, tags)) as unknown as Record<string, unknown>;
  } catch (error) {
    return {
      mode: "failed",
      tags,
      error: error instanceof Error ? error.message : "Unknown tag error"
    };
  }
}

function readAnalysisString(analysis: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const val = analysis[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }

  return undefined;
}

function readAnalysisBoolean(analysis: Record<string, unknown>, keys: string[]): boolean {
  for (const key of keys) {
    const val = analysis[key];
    if (typeof val === "boolean") return val;
    if (typeof val === "string") {
      const normalized = normalize(val);
      if (["true", "yes", "y", "1", "book", "booking", "appointment", "schedule", "scheduled"].includes(normalized)) {
        return true;
      }
      if (["false", "no", "n", "0", "none", "callback"].includes(normalized)) {
        return false;
      }
    }
  }

  return false;
}

function parseDateParts(value: string): { year: number; month: number; day: number } | undefined {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;

  const [, year, month, day] = match;
  const parts = {
    year: Number(year),
    month: Number(month),
    day: Number(day)
  };

  if (!parts.year || !parts.month || !parts.day) return undefined;
  return parts;
}

function parseTimeParts(value: string): { hour: number; minute: number } | undefined {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return undefined;

  const [, rawHour, rawMinute, meridiem] = match;
  let hour = Number(rawHour);
  const minute = Number(rawMinute ?? "0");

  if (minute < 0 || minute > 59) return undefined;

  if (meridiem) {
    if (hour < 1 || hour > 12) return undefined;
    if (meridiem.toLowerCase() === "pm" && hour !== 12) hour += 12;
    if (meridiem.toLowerCase() === "am" && hour === 12) hour = 0;
  } else if (hour < 0 || hour > 23) {
    return undefined;
  }

  return { hour, minute };
}

function zonedDateTimeToUtcIso(
  date: { year: number; month: number; day: number },
  time: { hour: number; minute: number },
  timeZone: string
): string {
  const utcGuess = Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute, 0, 0);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const parts = Object.fromEntries(formatter.formatToParts(new Date(utcGuess)).map((part) => [part.type, part.value]));
  const displayedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  const offset = displayedAsUtc - utcGuess;
  return new Date(utcGuess - offset).toISOString();
}

function resolveRequestedAppointment(
  analysis: Record<string, unknown>,
  timeZone: string
): { startTime?: string; endTime?: string; reason?: string; requestedDate?: string; requestedTime?: string } {
  const requestedDate = readAnalysisString(analysis, ["requested_date", "requestedDate", "appointment_date"]);
  const requestedTime = readAnalysisString(analysis, ["requested_time", "requestedTime", "appointment_time"]);
  const durationMinutes = 60;

  if (!requestedDate) {
    return { reason: "Missing requested_date" };
  }

  const directDate = new Date(requestedDate);
  if (requestedDate.includes("T") && !Number.isNaN(directDate.getTime())) {
    const end = new Date(directDate.getTime() + durationMinutes * 60_000);
    return {
      startTime: directDate.toISOString(),
      endTime: end.toISOString(),
      requestedDate,
      requestedTime
    };
  }

  if (!requestedTime) {
    return { reason: "Missing requested_time", requestedDate };
  }

  const dateParts = parseDateParts(requestedDate);
  if (!dateParts) {
    return { reason: "requested_date must be YYYY-MM-DD or ISO datetime", requestedDate, requestedTime };
  }

  const timeParts = parseTimeParts(requestedTime);
  if (!timeParts) {
    return { reason: "requested_time must be HH:mm, h:mm AM/PM, or h AM/PM", requestedDate, requestedTime };
  }

  const startTime = zonedDateTimeToUtcIso(dateParts, timeParts, timeZone);
  const endTime = new Date(new Date(startTime).getTime() + durationMinutes * 60_000).toISOString();
  return { startTime, endTime, requestedDate, requestedTime };
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

export function webhooksRouter(store: Store, ghlClient: GhlClient): Router {
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
      const tags = await safeAddTags(ghlClient, ghlResult.contactId, leadTags(client.slug, payload.source, service));

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
        tags,
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
      const firstName = readAnalysisString(analysis, ["first_name", "firstName"]);
      const lastName = readAnalysisString(analysis, ["last_name", "lastName"]);
      const phone = readAnalysisString(analysis, ["phone", "phone_number"]) ?? call.from_number;
      const email = readAnalysisString(analysis, ["email"]);
      const serviceRequested = readAnalysisString(analysis, ["service_requested", "serviceRequested", "service"]);
      const zip = readAnalysisString(analysis, ["zip_code", "zip", "postal_code"]);
      const requestedDate = readAnalysisString(analysis, ["requested_date", "requestedDate", "appointment_date"]);
      const requestedTime = readAnalysisString(analysis, ["requested_time", "requestedTime", "appointment_time"]);
      const appointmentIntent = readAnalysisBoolean(analysis, [
        "appointment_intent",
        "appointmentIntent",
        "appointment_requested",
        "voice_ai_appointment_request"
      ]);
      const estimateRequested = readAnalysisBoolean(analysis, [
        "estimate_requested",
        "estimateRequested",
        "estimate_intent",
        "estimateIntent"
      ]);
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
          requested_date: requestedDate,
          requested_time: requestedTime,
          appointment_intent: appointmentIntent ? "true" : "false",
          retell_call_id: call.call_id
        }
      });
      const appointmentRequestedEnabled = client.pluginToggles["Appt Requested"] ?? true;
      const appointmentConfirmationEnabled = client.pluginToggles["Appt Confirmed"] ?? true;
      const estimateEnabled = client.pluginToggles["Estimate Requested"] ?? true;
      let tags = await safeAddTags(ghlClient, ghlResult.contactId, leadTags(client.slug, "retell_ai", service));

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

      let appointment:
        | {
            status: "booked";
            calendarId: string;
            startTime: string;
            endTime: string;
            appointmentId: string;
            ghl: Record<string, unknown>;
          }
        | {
            status: "skipped";
            reason: string;
            requestedDate?: string;
            requestedTime?: string;
          };

      const routedCalendarId = routeDecision.matched ? routeDecision.calendar?.ghlCalendarId : undefined;
      if (!appointmentRequestedEnabled) {
        appointment = {
          status: "skipped",
          reason: "Appt Requested mode is disabled for this client",
          requestedDate,
          requestedTime
        };
      } else if (!appointmentIntent) {
        appointment = {
          status: "skipped",
          reason: "appointment_intent was not true",
          requestedDate,
          requestedTime
        };
      } else if (!routedCalendarId) {
        appointment = {
          status: "skipped",
          reason: "No routed calendar matched this service/location",
          requestedDate,
          requestedTime
        };
      } else {
        const requestedAppointment = resolveRequestedAppointment(analysis, client.timezone);
        if (!requestedAppointment.startTime || !requestedAppointment.endTime) {
          appointment = {
            status: "skipped",
            reason: requestedAppointment.reason ?? "Requested appointment time is not exact enough",
            requestedDate: requestedAppointment.requestedDate ?? requestedDate,
            requestedTime: requestedAppointment.requestedTime ?? requestedTime
          };
        } else {
          const appointmentResult = await ghlClient.createAppointment({
            subAccountId: client.ghlSubAccountId,
            calendarId: routedCalendarId,
            contactId: ghlResult.contactId,
            startTime: requestedAppointment.startTime,
            endTime: requestedAppointment.endTime,
            title:
              [firstName, lastName].filter(Boolean).join(" ") ||
              `${service ?? "Service"} appointment` ||
              phone ||
              "Voice AI appointment",
            description: [
              `Source: Retell AI`,
              service ? `Service: ${service}` : undefined,
              zip ? `ZIP: ${zip}` : undefined,
              call.call_analysis?.call_summary ? `Summary: ${call.call_analysis.call_summary}` : undefined
            ]
              .filter(Boolean)
              .join("\n")
          });

          appointment = {
            status: "booked",
            calendarId: routedCalendarId,
            startTime: requestedAppointment.startTime,
            endTime: requestedAppointment.endTime,
            appointmentId: appointmentResult.appointmentId,
            ghl: appointmentResult as unknown as Record<string, unknown>
          };
        }
      }

      const modeTags = retellModeTags({
        appointmentStatus: appointment.status,
        appointmentConfirmationEnabled,
        estimateRequested,
        estimateEnabled
      });
      if (modeTags.length > 0) {
        tags = await safeAddTags(ghlClient, ghlResult.contactId, [
          ...leadTags(client.slug, "retell_ai", service),
          ...modeTags
        ]);
      }

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
        appointmentStatus: appointment.status,
        appointmentRequestedEnabled,
        appointmentConfirmationEnabled,
        appointmentId: appointment.status === "booked" ? appointment.appointmentId : undefined,
        appointmentStartTime: appointment.status === "booked" ? appointment.startTime : undefined,
        appointmentEndTime: appointment.status === "booked" ? appointment.endTime : undefined,
        appointmentSkipReason: appointment.status === "skipped" ? appointment.reason : undefined,
        requestedDate,
        requestedTime,
        appointmentIntent,
        estimateRequested,
        estimateEnabled,
        callTranscript: call.transcript,
        callSummary: call.call_analysis?.call_summary,
        retellCallId: call.call_id
      });

      const result = { routeDecision, ghl: ghlResult, tags, appointment, leadId: lead.id };

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
