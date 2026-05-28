import type { ClientConfig, EventLog, LeadRecord } from "../types/domain.js";

export interface Store {
  init(): Promise<void>;
  listClients(): Promise<ClientConfig[]>;
  getClientById(id: string): Promise<ClientConfig | undefined>;
  getClientBySlug(slug: string): Promise<ClientConfig | undefined>;
  upsertClient(config: ClientConfig): Promise<ClientConfig>;
  removeClient(id: string): Promise<boolean>;
  addLead(lead: LeadRecord): Promise<LeadRecord>;
  listLeads(limit?: number): Promise<LeadRecord[]>;
  addEvent(event: EventLog): Promise<EventLog>;
  findEventByIdempotencyKey(clientId: string, eventType: EventLog["eventType"], key: string): Promise<EventLog | undefined>;
  listEvents(limit?: number): Promise<EventLog[]>;
  createEvent(input: Omit<EventLog, "id">): Promise<EventLog>;
}
