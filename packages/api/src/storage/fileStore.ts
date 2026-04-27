import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { v4 as uuidv4 } from "uuid";
import { env } from "../config.js";
import { buildDefaultStore } from "../seed.js";
import type { ClientConfig, DataStore, EventLog, LeadRecord } from "../types/domain.js";

export class FileStore {
  private readonly filePath: string;
  private writeLock: Promise<void> = Promise.resolve();

  constructor(pathFromEnv = env.DATA_FILE) {
    this.filePath = resolve(process.cwd(), pathFromEnv);
  }

  async init(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });

    try {
      const current = await this.load();
      const migrated = this.migrateLegacyBranding(current);
      if (migrated) {
        await this.save(current);
      }
    } catch {
      const seed = buildDefaultStore();
      await this.save(seed);
    }
  }

  async listClients(): Promise<ClientConfig[]> {
    const data = await this.load();
    return data.clients;
  }

  async getClientById(id: string): Promise<ClientConfig | undefined> {
    const data = await this.load();
    return data.clients.find((client) => client.id === id);
  }

  async getClientBySlug(slug: string): Promise<ClientConfig | undefined> {
    const data = await this.load();
    return data.clients.find((client) => client.slug === slug);
  }

  async upsertClient(config: ClientConfig): Promise<ClientConfig> {
    return this.withWrite(async (data) => {
      const index = data.clients.findIndex((client) => client.id === config.id);
      if (index >= 0) {
        data.clients[index] = config;
      } else {
        data.clients.push(config);
      }

      return config;
    });
  }

  async removeClient(id: string): Promise<boolean> {
    return this.withWrite(async (data) => {
      const before = data.clients.length;
      data.clients = data.clients.filter((client) => client.id !== id);
      return data.clients.length < before;
    });
  }

  async addLead(lead: LeadRecord): Promise<LeadRecord> {
    return this.withWrite(async (data) => {
      data.leads.push(lead);
      return lead;
    });
  }

  async listLeads(limit = 100): Promise<LeadRecord[]> {
    const data = await this.load();
    return data.leads.slice(-limit).reverse();
  }

  async addEvent(event: EventLog): Promise<EventLog> {
    return this.withWrite(async (data) => {
      data.events.push(event);
      if (data.events.length > 10000) {
        data.events = data.events.slice(data.events.length - 10000);
      }
      return event;
    });
  }

  async findEventByIdempotencyKey(clientId: string, eventType: EventLog["eventType"], key: string): Promise<EventLog | undefined> {
    const data = await this.load();
    return data.events.find((event) => event.clientId === clientId && event.eventType === eventType && event.idempotencyKey === key);
  }

  async listEvents(limit = 200): Promise<EventLog[]> {
    const data = await this.load();
    return data.events.slice(-limit).reverse();
  }

  async createEvent(input: Omit<EventLog, "id">): Promise<EventLog> {
    const event: EventLog = {
      ...input,
      id: uuidv4()
    };
    return this.addEvent(event);
  }

  private async load(): Promise<DataStore> {
    const text = await readFile(this.filePath, "utf8");
    return JSON.parse(text) as DataStore;
  }

  private async save(store: DataStore): Promise<void> {
    const tmpPath = `${this.filePath}.tmp`;
    await writeFile(tmpPath, JSON.stringify(store, null, 2), "utf8");
    await rename(tmpPath, this.filePath);
  }

  private migrateLegacyBranding(store: DataStore): boolean {
    let changed = false;

    for (const client of store.clients) {
      let clientChanged = false;

      if (client.slug === "nonstop_automation") {
        client.slug = "multiply_talents";
        clientChanged = true;
      }

      if (client.clientName === "Nonstop Automation") {
        client.clientName = "Multiply Talents";
        clientChanged = true;
      }

      if (clientChanged) {
        changed = true;
        client.updatedAt = new Date().toISOString();
      }
    }

    return changed;
  }

  private async withWrite<T>(fn: (store: DataStore) => Promise<T> | T): Promise<T> {
    const previous = this.writeLock;
    let release: () => void;
    this.writeLock = new Promise<void>((resolveLock) => {
      release = resolveLock;
    });

    await previous;

    try {
      const store = await this.load();
      const result = await fn(store);
      await this.save(store);
      return result;
    } finally {
      release!();
    }
  }
}
