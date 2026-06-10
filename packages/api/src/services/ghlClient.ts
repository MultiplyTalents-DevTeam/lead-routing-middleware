import { v4 as uuidv4 } from "uuid";
import { env } from "../config.js";
import { logger } from "../logger.js";
import type { GhlFieldMappings } from "../types/domain.js";

interface LeadUpsertInput {
  subAccountId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  source: string;
  serviceRequested?: string;
  zip?: string;
  externalLeadId?: string;
  routedCalendarId?: string;
  pipelineId?: string;
  pipelineStageId?: string;
  opportunityName?: string;
  monetaryValue?: number;
  fieldMappings?: GhlFieldMappings;
  metadata: Record<string, unknown>;
}

interface StageUpdateInput {
  subAccountId: string;
  externalContactId?: string;
  stage: string;
  payload: Record<string, unknown>;
}

interface AppointmentCreateInput {
  subAccountId: string;
  calendarId: string;
  contactId: string;
  startTime: string;
  endTime: string;
  title: string;
  description?: string;
  assignedUserId?: string;
  meetingLocationType?: "custom" | "zoom" | "gmeet" | "phone" | "address" | "ms_teams" | "google";
}

export interface GhlActionResult {
  mode: "live" | "mock";
  contactId: string;
  opportunityId: string;
  details: Record<string, unknown>;
}

export interface GhlAppointmentResult {
  mode: "live" | "mock";
  appointmentId: string;
  details: Record<string, unknown>;
}

export interface GhlTagResult {
  mode: "live" | "mock";
  tags: string[];
  details: Record<string, unknown>;
}

interface GhlContactResponse {
  contact?: {
    id?: string;
    contactId?: string;
  };
  id?: string;
  contactId?: string;
}

interface GhlOpportunityResponse {
  opportunity?: {
    id?: string;
    opportunityId?: string;
  };
  id?: string;
  opportunityId?: string;
}

interface GhlAppointmentResponse {
  appointment?: {
    id?: string;
    appointmentId?: string;
  };
  event?: {
    id?: string;
    eventId?: string;
  };
  id?: string;
  appointmentId?: string;
  eventId?: string;
}

interface GhlCustomField {
  id: string;
  field_value: unknown;
}

function compactPayload(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null));
}

function readMetadataString(metadata: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function addCustomField(fields: GhlCustomField[], id: string | undefined, value: unknown): void {
  if (!id || value === undefined || value === null || value === "") {
    return;
  }

  fields.push({ id, field_value: value });
}

function fieldId(
  mappings: GhlFieldMappings | undefined,
  key: keyof GhlFieldMappings,
  fallback?: string
): string | undefined {
  return mappings?.[key] || fallback;
}

function buildLeadCustomFields(input: LeadUpsertInput): GhlCustomField[] {
  const fields: GhlCustomField[] = [];
  const mappings = input.fieldMappings;
  const serviceRequested =
    input.serviceRequested ?? readMetadataString(input.metadata, ["serviceRequested", "service_requested"]);
  const zip = input.zip ?? readMetadataString(input.metadata, ["zip", "zip_code", "postalCode"]);
  const externalLeadId =
    input.externalLeadId ?? readMetadataString(input.metadata, ["externalLeadId", "external_lead_id"]);
  const callDirection = readMetadataString(input.metadata, ["call_direction", "callDirection"]) ?? "inbound";
  const callTranscript = readMetadataString(input.metadata, ["call_transcript", "callTranscript", "transcript"]);
  const locationBranch = readMetadataString(input.metadata, ["location_branch", "locationBranch", "branch"]);
  const assignedRep = readMetadataString(input.metadata, ["assigned_rep", "assignedRep"]);
  const estimateStatus = readMetadataString(input.metadata, ["estimate_status", "estimateStatus"]);
  const declineReason = readMetadataString(input.metadata, ["decline_reason", "declineReason"]);
  const lastJobType =
    readMetadataString(input.metadata, ["last_job_type", "lastJobType", "job_type", "jobType"]) ?? serviceRequested;
  const leadSource = readMetadataString(input.metadata, ["lead_source", "leadSource"]) ?? input.source;
  const leadSourceOption = ["angie", "thumbtack", "lsa", "social", "vendor-webhook", "other"].includes(
    leadSource.trim().toLowerCase()
  )
    ? leadSource.trim().toLowerCase()
    : "other";

  addCustomField(fields, fieldId(mappings, "serviceRequest"), serviceRequested);
  addCustomField(fields, fieldId(mappings, "serviceRequested", env.GHL_FIELD_SERVICE_REQUESTED), serviceRequested);
  addCustomField(fields, fieldId(mappings, "routedCalendarId", env.GHL_FIELD_ROUTED_CALENDAR_ID), input.routedCalendarId);
  addCustomField(fields, fieldId(mappings, "leadSource", env.GHL_FIELD_LEAD_SOURCE), leadSourceOption);
  addCustomField(fields, fieldId(mappings, "serviceAreaZip", env.GHL_FIELD_ZIP_CODE), zip);
  addCustomField(fields, fieldId(mappings, "callDirection", env.GHL_FIELD_CALL_DIRECTION), callDirection);
  addCustomField(fields, fieldId(mappings, "callTranscript", env.GHL_FIELD_CALL_TRANSCRIPT), callTranscript);
  addCustomField(fields, fieldId(mappings, "externalLeadId", env.GHL_FIELD_EXTERNAL_LEAD_ID), externalLeadId);
  addCustomField(fields, fieldId(mappings, "locationBranch"), locationBranch);
  addCustomField(fields, fieldId(mappings, "assignedRep"), assignedRep);
  addCustomField(fields, fieldId(mappings, "estimateStatus"), estimateStatus);
  addCustomField(fields, fieldId(mappings, "declineReason"), declineReason);
  addCustomField(fields, fieldId(mappings, "lastJobType"), lastJobType);

  return fields;
}

function getContactId(response: GhlContactResponse): string {
  return String(response.contact?.id ?? response.contact?.contactId ?? response.contactId ?? response.id ?? uuidv4());
}

function getOpportunityId(response: GhlOpportunityResponse): string {
  return String(response.opportunity?.id ?? response.opportunity?.opportunityId ?? response.opportunityId ?? response.id ?? uuidv4());
}

function getAppointmentId(response: GhlAppointmentResponse): string {
  return String(
    response.appointment?.id ??
      response.appointment?.appointmentId ??
      response.event?.id ??
      response.event?.eventId ??
      response.appointmentId ??
      response.eventId ??
      response.id ??
      uuidv4()
  );
}

export class GhlClient {
  private readonly liveEnabled: boolean;

  constructor() {
    this.liveEnabled = Boolean(env.GHL_API_KEY && env.GHL_BASE_URL);
  }

  async upsertLead(input: LeadUpsertInput): Promise<GhlActionResult> {
    if (!this.liveEnabled) {
      return {
        mode: "mock",
        contactId: `mock_contact_${uuidv4()}`,
        opportunityId: `mock_opp_${uuidv4()}`,
        details: {
          subAccountId: input.subAccountId,
          routedCalendarId: input.routedCalendarId,
          source: input.source
        }
      };
    }

    const contactEndpoint = `${env.GHL_BASE_URL}/contacts/upsert`;
    const customFields = buildLeadCustomFields(input);
    const contactPayload = compactPayload({
      locationId: input.subAccountId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      source: input.source,
      customFields: customFields.length > 0 ? customFields : undefined
    });

    const contactResponse = (await this.requestWithRetry(contactEndpoint, contactPayload)) as GhlContactResponse;
    const contactId = getContactId(contactResponse);
    const pipelineId =
      input.pipelineId ?? readMetadataString(input.metadata, ["ghlPipelineId", "pipelineId"]) ?? env.GHL_PIPELINE_ID;
    const pipelineStageId =
      input.pipelineStageId ??
      readMetadataString(input.metadata, ["ghlPipelineStageId", "pipelineStageId"]) ??
      env.GHL_PIPELINE_STAGE_ID;

    if (!pipelineId || !pipelineStageId) {
      logger.warn({ subAccountId: input.subAccountId }, "Skipping opportunity creation: GHL_PIPELINE_ID or GHL_PIPELINE_STAGE_ID not configured");
      return {
        mode: "live",
        contactId,
        opportunityId: "",
        details: { contact: contactResponse, opportunity: null }
      };
    }

    const opportunityEndpoint = `${env.GHL_BASE_URL}/opportunities/`;
    const opportunityPayload = compactPayload({
      locationId: input.subAccountId,
      contactId,
      pipelineId,
      pipelineStageId,
      name:
        input.opportunityName ??
        ([input.firstName, input.lastName].filter(Boolean).join(" ") || input.phone || input.email || "New Lead"),
      source: input.source,
      status: "open",
      monetaryValue: input.monetaryValue
    });

    try {
      const opportunityResponse = (await this.requestWithRetry(
        opportunityEndpoint,
        opportunityPayload
      )) as GhlOpportunityResponse;

      return {
        mode: "live",
        contactId,
        opportunityId: getOpportunityId(opportunityResponse),
        details: {
          contact: contactResponse,
          opportunity: opportunityResponse
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes("duplicate opportunity")) {
        logger.warn({ subAccountId: input.subAccountId, contactId }, "Skipping duplicate opportunity — contact already has one in this pipeline");
        return {
          mode: "live",
          contactId,
          opportunityId: "",
          details: {
            contact: contactResponse,
            opportunity: null,
            skipped: "duplicate_opportunity"
          }
        };
      }
      throw error;
    }
  }

  async updateStage(input: StageUpdateInput): Promise<GhlActionResult> {
    if (!this.liveEnabled) {
      return {
        mode: "mock",
        contactId: input.externalContactId ?? `mock_contact_${uuidv4()}`,
        opportunityId: `mock_opp_${uuidv4()}`,
        details: {
          stage: input.stage,
          subAccountId: input.subAccountId,
          payload: input.payload
        }
      };
    }

    const endpoint = `${env.GHL_BASE_URL}/opportunities/stage`;
    const payload = {
      locationId: input.subAccountId,
      contactId: input.externalContactId,
      stage: input.stage,
      payload: input.payload
    };

    const response = await this.requestWithRetry(endpoint, payload);
    return {
      mode: "live",
      contactId: String(response.contactId ?? input.externalContactId ?? uuidv4()),
      opportunityId: String(response.opportunityId ?? response.id ?? uuidv4()),
      details: response
    };
  }

  async createAppointment(input: AppointmentCreateInput): Promise<GhlAppointmentResult> {
    if (!this.liveEnabled) {
      return {
        mode: "mock",
        appointmentId: `mock_appt_${uuidv4()}`,
        details: {
          subAccountId: input.subAccountId,
          calendarId: input.calendarId,
          contactId: input.contactId,
          startTime: input.startTime,
          endTime: input.endTime,
          title: input.title
        }
      };
    }

    const endpoint = `${env.GHL_BASE_URL}/calendars/events/appointments`;
    const payload = compactPayload({
      locationId: input.subAccountId,
      calendarId: input.calendarId,
      contactId: input.contactId,
      startTime: input.startTime,
      endTime: input.endTime,
      title: input.title,
      appointmentStatus: "confirmed",
      meetingLocationType: input.meetingLocationType ?? "phone",
      overrideLocationConfig: true,
      toNotify: true,
      ignoreDateRange: false,
      ignoreFreeSlotValidation: false,
      assignedUserId: input.assignedUserId,
      description: input.description
    });

    const response = (await this.requestWithRetry(endpoint, payload)) as GhlAppointmentResponse;

    return {
      mode: "live",
      appointmentId: getAppointmentId(response),
      details: response as unknown as Record<string, unknown>
    };
  }

  async addTags(contactId: string, tags: string[]): Promise<GhlTagResult> {
    const cleanTags = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
    if (cleanTags.length === 0) {
      return {
        mode: this.liveEnabled ? "live" : "mock",
        tags: [],
        details: { skipped: true, reason: "No tags supplied" }
      };
    }

    if (!this.liveEnabled) {
      return {
        mode: "mock",
        tags: cleanTags,
        details: { contactId, tags: cleanTags }
      };
    }

    const endpoint = `${env.GHL_BASE_URL}/contacts/${contactId}/tags`;
    const response = await this.requestWithRetry(endpoint, { tags: cleanTags });

    return {
      mode: "live",
      tags: Array.isArray(response.tags) ? response.tags.map(String) : cleanTags,
      details: response
    };
  }

  async triggerWorkflow(data: Record<string, unknown>): Promise<boolean> {
    const url = env.GHL_WORKFLOW_WEBHOOK_URL;
    if (!url) {
      logger.warn("GHL_WORKFLOW_WEBHOOK_URL not set — skipping workflow trigger");
      return false;
    }

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data)
        });
        if (!response.ok) {
          const body = await response.text();
          throw new Error(`Workflow trigger failed (${response.status}): ${body}`);
        }
        logger.info("GHL workflow triggered successfully");
        return true;
      } catch (error) {
        const err = error instanceof Error ? error.message : "Unknown error";
        logger.warn({ attempt, err }, "GHL workflow trigger attempt failed");
        if (attempt >= maxAttempts) return false;
        await new Promise((resolve) => setTimeout(resolve, attempt * 300));
      }
    }
    return false;
  }

  private async requestWithRetry(url: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const headers = {
      Authorization: `Bearer ${env.GHL_API_KEY}`,
      Version: env.GHL_API_VERSION,
      "Content-Type": "application/json"
    };

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`GHL request failed (${response.status}): ${body}`);
        }

        return (await response.json()) as Record<string, unknown>;
      } catch (error) {
        const err = error instanceof Error ? error.message : "Unknown error";
        logger.warn({ attempt, err }, "GHL request attempt failed");
        if (attempt >= maxAttempts) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, attempt * 300));
      }
    }

    throw new Error("GHL request retry loop exhausted");
  }
}
