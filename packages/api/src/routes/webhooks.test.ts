import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { env } from "../config.js";
import { GhlClient } from "../services/ghlClient.js";
import { FileStore } from "../storage/fileStore.js";

describe("webhooks idempotency", () => {
  let app: ReturnType<typeof createApp>;
  let store: FileStore;
  let storeDir = "";

  beforeAll(async () => {
    storeDir = await mkdtemp(join(tmpdir(), "mt-middleware-"));
    store = new FileStore(join(storeDir, "store.json"));
    await store.init();

    app = createApp({
      store,
      ghlClient: new GhlClient()
    });
  });

  afterAll(async () => {
    if (storeDir) {
      await rm(storeDir, { recursive: true, force: true });
    }
  });

  it("returns duplicate=true on repeated webhook with same idempotency key", async () => {
    const payload = {
      clientSlug: "multiply_talents",
      source: "angie",
      externalLeadId: "lead-123",
      phone: "+15551234567",
      serviceRequested: "Duct Cleaning",
      zip: "78701"
    };

    const first = await request(app)
      .post("/api/webhooks/lead")
      .set("x-webhook-secret", env.WEBHOOK_SECRET)
      .set("x-idempotency-key", "same-key")
      .send(payload);

    expect(first.status).toBe(202);
    expect(first.body.accepted).toBe(true);

    const second = await request(app)
      .post("/api/webhooks/lead")
      .set("x-webhook-secret", env.WEBHOOK_SECRET)
      .set("x-idempotency-key", "same-key")
      .send(payload);

    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
  });

  it("processes estimate webhook and maps to GHL stage", async () => {
    const response = await request(app)
      .post("/api/webhooks/estimate")
      .set("x-webhook-secret", env.WEBHOOK_SECRET)
      .set("x-idempotency-key", "estimate-key")
      .send({
        clientSlug: "multiply_talents",
        externalContactId: "contact-1",
        estimateStatus: "declined",
        declineReason: "price",
        payload: {
          estimateId: "est-1001"
        }
      });

    expect(response.status).toBe(202);
    expect(response.body.accepted).toBe(true);
    expect(response.body.result.mappedStage).toBe("Lost");
    expect(response.body.result.pricingObjection).toBe(true);
  });

  it("books a GHL appointment from a Retell analyzed call with exact date and time", async () => {
    const response = await request(app)
      .post("/api/webhooks/retell")
      .send({
        event: "call_analyzed",
        call: {
          call_id: "retell-booking-1",
          from_number: "+15551234567",
          direction: "inbound",
          transcript: "I need duct cleaning tomorrow at 10 AM.",
          call_analysis: {
            call_summary: "Customer wants duct cleaning and requested a specific appointment time.",
            custom_analysis_data: {
              first_name: "Jane",
              last_name: "Doe",
              phone: "+15551234567",
              service_requested: "Duct Cleaning",
              zip_code: "78701",
              appointment_intent: true,
              requested_date: "2026-06-01",
              requested_time: "10:00"
            }
          },
          metadata: {
            client_slug: "multiply_talents"
          }
        }
      });

    expect(response.status).toBe(202);
    expect(response.body.accepted).toBe(true);
    expect(response.body.result.routeDecision.matched).toBe(true);
    expect(response.body.result.appointment.status).toBe("booked");
    expect(response.body.result.appointment.calendarId).toBe("LzcCsHBbXZtBS1mAwbEc");
    expect(response.body.result.appointment.appointmentId).toMatch(/^mock_appt_/);
  });

  it("skips appointment booking when Retell date/time is vague", async () => {
    const response = await request(app)
      .post("/api/webhooks/retell")
      .send({
        event: "call_analyzed",
        call: {
          call_id: "retell-booking-vague-1",
          from_number: "+15557654321",
          direction: "inbound",
          transcript: "I need duct cleaning sometime tomorrow morning.",
          call_analysis: {
            call_summary: "Customer wants duct cleaning but gave a vague time.",
            custom_analysis_data: {
              first_name: "Sam",
              phone: "+15557654321",
              service_requested: "Duct Cleaning",
              zip_code: "78701",
              appointment_intent: true,
              requested_date: "tomorrow",
              requested_time: "morning"
            }
          },
          metadata: {
            client_slug: "multiply_talents"
          }
        }
      });

    expect(response.status).toBe(202);
    expect(response.body.accepted).toBe(true);
    expect(response.body.result.routeDecision.matched).toBe(true);
    expect(response.body.result.appointment.status).toBe("skipped");
    expect(response.body.result.appointment.reason).toContain("requested_date");
  });

  it("respects Appt Requested toggle by skipping direct booking", async () => {
    const client = await store.getClientBySlug("multiply_talents");
    if (!client) throw new Error("Missing seeded client");

    await store.upsertClient({
      ...client,
      pluginToggles: {
        ...client.pluginToggles,
        "Appt Requested": false
      }
    });

    const response = await request(app)
      .post("/api/webhooks/retell")
      .send({
        event: "call_analyzed",
        call: {
          call_id: "retell-booking-disabled-1",
          from_number: "+15550001111",
          direction: "inbound",
          transcript: "I need duct cleaning on June first at 10 AM.",
          call_analysis: {
            call_summary: "Customer wants duct cleaning and provided a specific time.",
            custom_analysis_data: {
              first_name: "Taylor",
              phone: "+15550001111",
              service_requested: "Duct Cleaning",
              zip_code: "78701",
              appointment_intent: true,
              requested_date: "2026-06-01",
              requested_time: "10:00"
            }
          },
          metadata: {
            client_slug: "multiply_talents"
          }
        }
      });

    expect(response.status).toBe(202);
    expect(response.body.result.appointment.status).toBe("skipped");
    expect(response.body.result.appointment.reason).toBe("Appt Requested mode is disabled for this client");

    await store.upsertClient(client);
  });
});
