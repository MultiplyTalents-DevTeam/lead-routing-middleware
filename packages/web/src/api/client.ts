import type { ApiListConfigsResponse, ApiRoutePreviewResponse, ApiSingleConfigResponse, ClientConfig, EventLog } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN ?? "change-me-admin-token";

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": ADMIN_TOKEN
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API ${response.status}: ${text}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function fetchConfigs(): Promise<ClientConfig[]> {
  const response = await request<ApiListConfigsResponse>("/configs");
  return response.clients;
}

export async function fetchConfig(id: string): Promise<ClientConfig> {
  const response = await request<ApiSingleConfigResponse>(`/configs/${id}`);
  return response.client;
}

export async function updateConfig(id: string, payload: Omit<ClientConfig, "id" | "createdAt" | "updatedAt">): Promise<ClientConfig> {
  const response = await request<ApiSingleConfigResponse>(`/configs/${id}`, {
    method: "PUT",
    body: payload
  });

  return response.client;
}

export async function createConfig(payload: Omit<ClientConfig, "id" | "createdAt" | "updatedAt">): Promise<ClientConfig> {
  const response = await request<ApiSingleConfigResponse>("/configs", {
    method: "POST",
    body: payload
  });

  return response.client;
}

export async function deleteConfig(id: string): Promise<void> {
  await request<void>(`/configs/${id}`, {
    method: "DELETE"
  });
}

export async function previewRoute(input: {
  clientId: string;
  service: string;
  zip?: string;
  lat?: number;
  lng?: number;
  stage?: string;
}): Promise<ApiRoutePreviewResponse> {
  return request<ApiRoutePreviewResponse>("/route/preview", {
    method: "POST",
    body: input
  });
}

export async function fetchEvents(limit = 60): Promise<EventLog[]> {
  const response = await request<{ events: EventLog[] }>(`/events?limit=${limit}`);
  return response.events;
}
