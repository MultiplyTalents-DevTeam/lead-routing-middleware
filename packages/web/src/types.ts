export type AreaMode = "NONE" | "ZIP_LIST" | "GEOFENCE_MI" | "POLYGON";

export interface PolygonPoint {
  lat: number;
  lng: number;
}

export interface ServiceArea {
  mode: AreaMode;
  zipCodes: string[];
  geofence?: {
    centerLat: number;
    centerLng: number;
    radiusMi: number;
  };
  polygonPoints: PolygonPoint[];
}

export interface CalendarRoute {
  id: string;
  label: string;
  ghlCalendarId: string;
  services: string[];
  area: ServiceArea;
}

export interface CustomQuestion {
  id: string;
  label: string;
  key: string;
  required: boolean;
}

export interface AutoField {
  key: string;
  label: string;
  required: boolean;
}

export interface StageMapping {
  id: string;
  externalStage: string;
  ghlStage: string;
  enabled: boolean;
}

export interface ClientConfig {
  id: string;
  slug: string;
  clientName: string;
  ghlSubAccountId: string;
  connectedCrm: string;
  timezone: string;
  industries: string[];
  businessUnits: string[];
  services: string[];
  calendarRoutes: CalendarRoute[];
  customQuestions: CustomQuestion[];
  autoFields: AutoField[];
  stageMappings: StageMapping[];
  pluginToggles: Record<string, boolean>;
  createdAt: string;
  updatedAt: string;
}

export interface ApiListConfigsResponse {
  clients: ClientConfig[];
}

export interface ApiSingleConfigResponse {
  client: ClientConfig;
}

export interface ApiRoutePreviewResponse {
  client: {
    id: string;
    slug: string;
    clientName: string;
  };
  decision: {
    matched: boolean;
    reason: string;
    score?: number;
    calendar?: {
      id: string;
      label: string;
      ghlCalendarId: string;
    };
  };
  stage?: string;
  pluginEnabled?: boolean;
}

export interface EventLog {
  id: string;
  idempotencyKey: string;
  clientId: string;
  eventType: "lead" | "status" | "estimate" | "job";
  status: "processed" | "duplicate" | "rejected" | "failed";
  receivedAt: string;
}
