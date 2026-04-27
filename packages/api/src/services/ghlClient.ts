import { v4 as uuidv4 } from "uuid";
import { env } from "../config.js";
import { logger } from "../logger.js";

interface LeadUpsertInput {
  subAccountId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  source: string;
  routedCalendarId?: string;
  metadata: Record<string, unknown>;
}

interface StageUpdateInput {
  subAccountId: string;
  externalContactId?: string;
  stage: string;
  payload: Record<string, unknown>;
}

export interface GhlActionResult {
  mode: "live" | "mock";
  contactId: string;
  opportunityId: string;
  details: Record<string, unknown>;
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

    const endpoint = `${env.GHL_BASE_URL}/contacts/upsert`;
    const payload = {
      locationId: input.subAccountId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      source: input.source,
      customFields: {
        routedCalendarId: input.routedCalendarId,
        ...input.metadata
      }
    };

    const response = await this.requestWithRetry(endpoint, payload);
    return {
      mode: "live",
      contactId: String(response.contactId ?? response.id ?? uuidv4()),
      opportunityId: String(response.opportunityId ?? response.oppId ?? uuidv4()),
      details: response
    };
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

  private async requestWithRetry(url: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const headers = {
      Authorization: `Bearer ${env.GHL_API_KEY}`,
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
