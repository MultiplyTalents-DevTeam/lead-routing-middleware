import { v4 as uuidv4 } from "uuid";
import type { ClientConfig, DataStore } from "./types/domain.js";

const MULTIPLY_TALENTS_ID = "c1a2b3c4-d5e6-7890-abcd-ef1234567890";
const ROUTE_DUCT_ID = "a1b2c3d4-e5f6-7890-abcd-111111111111";
const ROUTE_MINI_SPLIT_ID = "a1b2c3d4-e5f6-7890-abcd-222222222222";
const DEMO_CALENDAR_ID = "LzcCsHBbXZtBS1mAwbEc";

export function buildDefaultConfig(): ClientConfig {
  const now = new Date().toISOString();

  return {
    id: MULTIPLY_TALENTS_ID,
    slug: "multiply_talents",
    clientName: "Multiply Talents",
    ghlSubAccountId: "fifBD0MSR8EqqjlNkFbM",
    connectedCrm: "ServiceTitan",
    timezone: "America/Los_Angeles",
    industries: ["HVAC"],
    businessUnits: ["Residential Service", "Commercial Service"],
    services: ["Duct Cleaning", "Ductless Mini-Split"],
    calendarRoutes: [
      {
        id: ROUTE_DUCT_ID,
        label: "duct",
        ghlCalendarId: DEMO_CALENDAR_ID,
        services: ["Duct Cleaning"],
        area: {
          mode: "ZIP_LIST",
          zipCodes: ["78701", "78702", "78703"],
          polygonPoints: []
        }
      },
      {
        id: ROUTE_MINI_SPLIT_ID,
        label: "mini-split",
        ghlCalendarId: DEMO_CALENDAR_ID,
        services: ["Ductless Mini-Split"],
        area: {
          mode: "NONE",
          zipCodes: [],
          polygonPoints: []
        }
      }
    ],
    customQuestions: [
      {
        id: uuidv4(),
        key: "custom_question_1",
        label: "Custom Question 1",
        required: false
      },
      {
        id: uuidv4(),
        key: "custom_question_2",
        label: "Custom Question 2",
        required: false
      }
    ],
    autoFields: [
      { key: "call_direction", label: "Call Direction", required: true },
      { key: "voice_ai_appointment_request", label: "Voice Ai Appointment Request", required: true },
      { key: "voice_ai_callback_request", label: "Voice Ai Callback Request", required: true },
      { key: "callback_query", label: "Callback Query", required: true },
      { key: "call_transcript", label: "Call Transcript", required: true },
      { key: "call_summary", label: "Call Summary", required: true },
      { key: "service_needed", label: "Service Needed", required: true },
      { key: "requested_date", label: "Requested Date", required: true },
      { key: "requested_time", label: "Requested Time", required: true },
      { key: "call_recording", label: "Call Recording", required: true },
      { key: "business_unit", label: "Business Unit", required: true }
    ],
    stageMappings: [
      { id: uuidv4(), externalStage: "Lead - New",            ghlStage: "New Lead",          enabled: true },
      { id: uuidv4(), externalStage: "Appointment Requested", ghlStage: "Contacting",         enabled: true },
      { id: uuidv4(), externalStage: "Appointment Booked",    ghlStage: "Booked",             enabled: true },
      { id: uuidv4(), externalStage: "Follow Up Needed",      ghlStage: "Engaged (2-way)",    enabled: true },
      { id: uuidv4(), externalStage: "Estimate Sent",         ghlStage: "Estimate Sent",      enabled: true },
      { id: uuidv4(), externalStage: "Won",                   ghlStage: "Won",                enabled: true },
      { id: uuidv4(), externalStage: "Lost",                  ghlStage: "Lost",               enabled: true },
      { id: uuidv4(), externalStage: "Cancelled",             ghlStage: "Cancelled",          enabled: true },
      { id: uuidv4(), externalStage: "No Show",               ghlStage: "No-Show",            enabled: true },
      { id: uuidv4(), externalStage: "Job Scheduled",         ghlStage: "Job Scheduled",      enabled: true },
      { id: uuidv4(), externalStage: "Job In Progress",       ghlStage: "In Progress",        enabled: true },
      { id: uuidv4(), externalStage: "Job Completed",         ghlStage: "Completed",          enabled: true }
    ],
    pluginToggles: {
      "Appt Requested":         true,
      "Appt Confirmed":         true,
      "Estimate Requested":     true,
      "New Lead":               true,
      "Contacting":             true,
      "Engaged (2-way)":        false,
      "Booked":                 true,
      "Cancelled":              false,
      "No-Show":                false,
      "Estimate Sent":          true,
      "Won":                    true,
      "Lost":                   false,
      "Job Scheduled":          false,
      "In Progress":            false,
      "Completed":              true,
      "Review Requested":       false,
      "Review Received":        false,
      "Active Customer":        false,
      "Past Customer":          false,
      "Dormant / Reactivation": false
    },
    ghlFieldMappings: {
      leadSource: "krNKmxYIrhzybJaKQNTt",
      serviceRequest: "8qw6L82qy6W0v2yJ8MCi",
      serviceRequested: "xVouHNLowDPm1N4tTzrZ",
      serviceAreaZip: "XTqv3WVpaCLvrtpWH8KQ",
      locationBranch: "0F6qhgcyIdHTdWrQzMQl",
      assignedRep: "Q7RffLvfYJtncMnSdO76",
      estimateStatus: "jIUzyZS39Me3jwPcz8Ma",
      declineReason: "vjqyAgsxWucR6lR7gmeD",
      lastJobType: "wydMfnRi73M1SmYMD2Qh"
    },
    createdAt: now,
    updatedAt: now
  };
}

function buildDemoConfig(input: {
  id: string;
  slug: string;
  clientName: string;
  connectedCrm: string;
  timezone: string;
  industries: string[];
  businessUnits: string[];
  services: string[];
  calendarRoutes: ClientConfig["calendarRoutes"];
}): ClientConfig {
  const base = buildDefaultConfig();
  const now = new Date().toISOString();

  return {
    ...base,
    id: input.id,
    slug: input.slug,
    clientName: input.clientName,
    connectedCrm: input.connectedCrm,
    timezone: input.timezone,
    industries: input.industries,
    businessUnits: input.businessUnits,
    services: input.services,
    calendarRoutes: input.calendarRoutes,
    createdAt: now,
    updatedAt: now
  };
}

export function buildDemoConfigs(): ClientConfig[] {
  return [
    buildDemoConfig({
      id: "f02dfb70-7c28-4c58-ba47-5eb3e3d8e834",
      slug: "austin_hvac_demo",
      clientName: "Austin HVAC Demo",
      connectedCrm: "ServiceTitan",
      timezone: "America/Chicago",
      industries: ["HVAC"],
      businessUnits: ["Austin Residential"],
      services: ["AC Repair", "Duct Cleaning"],
      calendarRoutes: [
        {
          id: "8c201420-fc74-4bc8-9501-597ddae54b35",
          label: "austin-ac-repair",
          ghlCalendarId: DEMO_CALENDAR_ID,
          services: ["AC Repair"],
          area: {
            mode: "ZIP_LIST",
            zipCodes: ["73301", "78701", "78702"],
            polygonPoints: []
          }
        },
        {
          id: "976468d8-342a-4016-ac90-1d3908ebcb0f",
          label: "austin-duct-cleaning",
          ghlCalendarId: DEMO_CALENDAR_ID,
          services: ["Duct Cleaning"],
          area: {
            mode: "NONE",
            zipCodes: [],
            polygonPoints: []
          }
        }
      ]
    }),
    buildDemoConfig({
      id: "0f82b406-6286-4064-b767-91d8000b284e",
      slug: "abc_plumbing_demo",
      clientName: "ABC Plumbing Demo",
      connectedCrm: "ServiceTitan",
      timezone: "America/Los_Angeles",
      industries: ["Plumbing"],
      businessUnits: ["LA Residential"],
      services: ["Drain Cleaning", "Water Heater Repair"],
      calendarRoutes: [
        {
          id: "f3bd7122-c5e5-4419-aa24-7da68f19afe3",
          label: "abc-drain-cleaning",
          ghlCalendarId: DEMO_CALENDAR_ID,
          services: ["Drain Cleaning"],
          area: {
            mode: "ZIP_LIST",
            zipCodes: ["90001", "90002", "90003"],
            polygonPoints: []
          }
        },
        {
          id: "905cc7ea-012a-4b15-bd22-5cc3f27eb10a",
          label: "abc-water-heater",
          ghlCalendarId: DEMO_CALENDAR_ID,
          services: ["Water Heater Repair"],
          area: {
            mode: "NONE",
            zipCodes: [],
            polygonPoints: []
          }
        }
      ]
    }),
    buildDemoConfig({
      id: "d487d232-5d63-4b28-ab71-5e078f03f0f5",
      slug: "demo_electrical",
      clientName: "Demo Electrical",
      connectedCrm: "ServiceTitan",
      timezone: "America/New_York",
      industries: ["Electrical"],
      businessUnits: ["NYC Service"],
      services: ["Panel Upgrade", "Wiring Repair"],
      calendarRoutes: [
        {
          id: "cb97e2fb-99e3-4e6a-bcd2-60c7fe439991",
          label: "demo-panel-upgrade",
          ghlCalendarId: DEMO_CALENDAR_ID,
          services: ["Panel Upgrade"],
          area: {
            mode: "ZIP_LIST",
            zipCodes: ["10001", "10002", "10003"],
            polygonPoints: []
          }
        },
        {
          id: "c55f0893-ae07-42c7-83cf-7032c2044cec",
          label: "demo-wiring-repair",
          ghlCalendarId: DEMO_CALENDAR_ID,
          services: ["Wiring Repair"],
          area: {
            mode: "NONE",
            zipCodes: [],
            polygonPoints: []
          }
        }
      ]
    })
  ];
}

export function buildDefaultStore(): DataStore {
  return {
    clients: [buildDefaultConfig(), ...buildDemoConfigs()],
    leads: [],
    events: []
  };
}
