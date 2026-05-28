import type { ClientConfig } from "../types/domain.js";
import type { Store } from "../storage/store.js";

export interface ClientLookup {
  clientId?: string;
  clientSlug?: string;
}

export async function resolveClient(store: Store, lookup: ClientLookup): Promise<ClientConfig | undefined> {
  if (lookup.clientId) {
    return store.getClientById(lookup.clientId);
  }

  if (lookup.clientSlug) {
    return store.getClientBySlug(lookup.clientSlug);
  }

  return undefined;
}
