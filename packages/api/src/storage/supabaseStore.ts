import { v4 as uuidv4 } from "uuid";
import { env } from "../config.js";
import { buildDefaultStore } from "../seed.js";
import type { ClientConfig, EventLog, LeadRecord } from "../types/domain.js";
import type { Store } from "./store.js";

interface SupabaseClientRow {
  id: string;
  slug: string;
  data: ClientConfig;
  created_at?: string;
  updated_at?: string;
}

interface SupabaseLeadRow {
  id: string;
  client_id: string;
  data: LeadRecord;
  created_at?: string;
}

interface SupabaseEventRow {
  id: string;
  client_id: string;
  event_type: EventLog["eventType"];
  idempotency_key: string;
  status: EventLog["status"];
  payload: Record<string, unknown>;
  result: Record<string, unknown>;
  received_at: string;
  error_message?: string | null;
}

function readRequiredSupabaseEnv(): { url: string; serviceRoleKey: string } {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("STORE_DRIVER=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }

  return {
    url: env.SUPABASE_URL.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, ""),
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY
  };
}

function eventRowToLog(row: SupabaseEventRow): EventLog {
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    clientId: row.client_id,
    eventType: row.event_type,
    status: row.status,
    payload: row.payload,
    result: row.result,
    receivedAt: row.received_at,
    errorMessage: row.error_message ?? undefined
  };
}

export class SupabaseStore implements Store {
  private readonly restUrl: string;
  private readonly headers: Record<string, string>;

  constructor() {
    const config = readRequiredSupabaseEnv();
    this.restUrl = `${config.url}/rest/v1`;
    this.headers = {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json"
    };
  }

  async init(): Promise<void> {
    const seededClients = buildDefaultStore().clients;
    for (const client of seededClients) {
      const existing = await this.getClientBySlug(client.slug);
      if (!existing) {
        await this.upsertClient(client);
      } else {
        const merged = this.mergeSeedDefaults(existing, client);
        if (JSON.stringify(merged) !== JSON.stringify(existing)) {
          await this.upsertClient(merged);
        }
      }
    }
  }

  async listClients(): Promise<ClientConfig[]> {
    const rows = await this.request<SupabaseClientRow[]>("/clients?select=data&order=created_at.asc");
    return rows.map((row) => row.data);
  }

  async getClientById(id: string): Promise<ClientConfig | undefined> {
    const rows = await this.request<SupabaseClientRow[]>(`/clients?select=data&id=eq.${encodeURIComponent(id)}&limit=1`);
    return rows[0]?.data;
  }

  async getClientBySlug(slug: string): Promise<ClientConfig | undefined> {
    const rows = await this.request<SupabaseClientRow[]>(
      `/clients?select=data&slug=eq.${encodeURIComponent(slug)}&limit=1`
    );
    return rows[0]?.data;
  }

  async upsertClient(config: ClientConfig): Promise<ClientConfig> {
    const row = {
      id: config.id,
      slug: config.slug,
      data: config,
      created_at: config.createdAt,
      updated_at: config.updatedAt
    };

    await this.request<SupabaseClientRow[]>("/clients?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(row)
    });

    return config;
  }

  async removeClient(id: string): Promise<boolean> {
    const rows = await this.request<SupabaseClientRow[]>(`/clients?id=eq.${encodeURIComponent(id)}&select=id`, {
      method: "DELETE",
      headers: { Prefer: "return=representation" }
    });

    return rows.length > 0;
  }

  async addLead(lead: LeadRecord): Promise<LeadRecord> {
    const row = {
      id: lead.id,
      client_id: lead.clientId,
      data: lead,
      created_at: lead.createdAt
    };

    await this.request<SupabaseLeadRow[]>("/leads", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(row)
    });

    return lead;
  }

  async listLeads(limit = 100): Promise<LeadRecord[]> {
    const rows = await this.request<SupabaseLeadRow[]>(`/leads?select=data&order=created_at.desc&limit=${limit}`);
    return rows.map((row) => row.data);
  }

  async addEvent(event: EventLog): Promise<EventLog> {
    const row = {
      id: event.id,
      client_id: event.clientId,
      event_type: event.eventType,
      idempotency_key: event.idempotencyKey,
      status: event.status,
      payload: event.payload,
      result: event.result,
      received_at: event.receivedAt,
      error_message: event.errorMessage
    };

    await this.request<SupabaseEventRow[]>("/events", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(row)
    });

    return event;
  }

  async findEventByIdempotencyKey(clientId: string, eventType: EventLog["eventType"], key: string): Promise<EventLog | undefined> {
    const query = [
      "select=*",
      `client_id=eq.${encodeURIComponent(clientId)}`,
      `event_type=eq.${encodeURIComponent(eventType)}`,
      `idempotency_key=eq.${encodeURIComponent(key)}`,
      "limit=1"
    ].join("&");
    const rows = await this.request<SupabaseEventRow[]>(`/events?${query}`);

    return rows[0] ? eventRowToLog(rows[0]) : undefined;
  }

  async listEvents(limit = 200): Promise<EventLog[]> {
    const rows = await this.request<SupabaseEventRow[]>(`/events?select=*&order=received_at.desc&limit=${limit}`);
    return rows.map(eventRowToLog);
  }

  async createEvent(input: Omit<EventLog, "id">): Promise<EventLog> {
    const event: EventLog = {
      ...input,
      id: uuidv4()
    };
    return this.addEvent(event);
  }

  private async request<T>(
    path: string,
    options: { method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH"; headers?: Record<string, string>; body?: string } = {}
  ): Promise<T> {
    const response = await fetch(`${this.restUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...this.headers,
        ...options.headers
      },
      body: options.body
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Supabase request failed (${response.status}): ${body}`);
    }

    if (response.status === 204) {
      return [] as T;
    }

    const text = await response.text();
    return (text ? JSON.parse(text) : []) as T;
  }

  private mergeSeedDefaults(current: ClientConfig, seeded: ClientConfig): ClientConfig {
    const merged = structuredClone(current);
    let changed = false;

    for (const [key, enabled] of Object.entries(seeded.pluginToggles)) {
      if (merged.pluginToggles[key] === undefined) {
        merged.pluginToggles[key] = enabled;
        changed = true;
      }
    }

    for (const seededRoute of seeded.calendarRoutes) {
      const route = merged.calendarRoutes.find((entry) => entry.label === seededRoute.label);
      if (route && route.ghlCalendarId !== seededRoute.ghlCalendarId) {
        route.ghlCalendarId = seededRoute.ghlCalendarId;
        changed = true;
      }
    }

    if (changed) {
      merged.updatedAt = new Date().toISOString();
    }

    return merged;
  }
}
