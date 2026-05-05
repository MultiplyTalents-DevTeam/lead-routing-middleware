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

export interface GhlFieldMappings {
  leadSource?: string;
  serviceRequest?: string;
  serviceRequested?: string;
  serviceAreaZip?: string;
  locationBranch?: string;
  assignedRep?: string;
  estimateStatus?: string;
  declineReason?: string;
  lastJobType?: string;
  routedCalendarId?: string;
  callDirection?: string;
  callTranscript?: string;
  externalLeadId?: string;
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
  ghlFieldMappings: GhlFieldMappings;
  createdAt: string;
  updatedAt: string;
}

export interface LeadRecord {
  id: string;
  clientId: string;
  source: string;
  externalLeadId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  serviceRequested?: string;
  zip?: string;
  lat?: number;
  lng?: number;
  ghlContactId?: string;
  ghlOpportunityId?: string;
  routedCalendarId?: string;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export type EventType = "lead" | "status" | "estimate" | "job";

export interface EventLog {
  id: string;
  idempotencyKey: string;
  clientId: string;
  eventType: EventType;
  status: "processed" | "duplicate" | "rejected" | "failed";
  payload: Record<string, unknown>;
  result: Record<string, unknown>;
  receivedAt: string;
  errorMessage?: string;
}

export interface DataStore {
  clients: ClientConfig[];
  leads: LeadRecord[];
  events: EventLog[];
}

export interface RouteDecision {
  matched: boolean;
  reason: string;
  calendar?: CalendarRoute;
  score?: number;
}
