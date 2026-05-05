import { v4 as uuidv4 } from "uuid";
import type { ClientConfig, DataStore } from "./types/domain.js";

export function buildDefaultConfig(): ClientConfig {
  const now = new Date().toISOString();

  return {
    id: uuidv4(),
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
        id: uuidv4(),
        label: "duct",
        ghlCalendarId: "abc123",
        services: ["Duct Cleaning"],
        area: {
          mode: "ZIP_LIST",
          zipCodes: ["78701", "78702", "78703"],
          polygonPoints: []
        }
      },
      {
        id: uuidv4(),
        label: "mini-split",
        ghlCalendarId: "def456",
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
      { id: uuidv4(), externalStage: "Lead - New", ghlStage: "New Lead", enabled: true },
      { id: uuidv4(), externalStage: "Appointment Requested", ghlStage: "Appt Requested", enabled: true },
      { id: uuidv4(), externalStage: "Appointment Booked", ghlStage: "Appt Booked", enabled: true },
      { id: uuidv4(), externalStage: "Estimate Sent", ghlStage: "Estimate Sent", enabled: true },
      { id: uuidv4(), externalStage: "Follow Up Needed", ghlStage: "Callback Requested", enabled: false },
      { id: uuidv4(), externalStage: "Won", ghlStage: "Disposition", enabled: false }
    ],
    pluginToggles: {
      "New Lead": true,
      "Appt Requested": true,
      "Appt Booked": true,
      "Welcome Funnel": false,
      "Callback Requested": false,
      "Estimate Sent": true,
      Disposition: false,
      Review: false,
      "Annual Lead": false,
      "Annual Customer": false
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

export function buildDefaultStore(): DataStore {
  return {
    clients: [buildDefaultConfig()],
    leads: [],
    events: []
  };
}
