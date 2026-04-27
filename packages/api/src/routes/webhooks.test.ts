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
  let storeDir = "";

  beforeAll(async () => {
    storeDir = await mkdtemp(join(tmpdir(), "mt-middleware-"));
    const store = new FileStore(join(storeDir, "store.json"));
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
});
