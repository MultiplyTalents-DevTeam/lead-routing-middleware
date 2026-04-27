import { describe, expect, it } from "vitest";
import { buildDefaultConfig } from "../seed.js";
import { resolveRoute } from "./routing.js";

describe("resolveRoute", () => {
  it("matches zip-list calendar", () => {
    const config = buildDefaultConfig();

    const decision = resolveRoute(config, {
      service: "Duct Cleaning",
      zip: "78702"
    });

    expect(decision.matched).toBe(true);
    expect(decision.calendar?.label).toBe("duct");
  });

  it("falls back to no-match when zip is outside route area", () => {
    const config = buildDefaultConfig();

    const decision = resolveRoute(config, {
      service: "Duct Cleaning",
      zip: "99999"
    });

    expect(decision.matched).toBe(false);
  });
});
