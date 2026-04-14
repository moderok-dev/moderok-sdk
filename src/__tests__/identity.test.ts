import { describe, it, expect, vi } from "vitest";
import { createUuid, ensureUserId } from "../identity";

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("createUuid", () => {
  it("returns a valid UUID v4", () => {
    const uuid = createUuid();
    expect(uuid).toMatch(UUID_V4_REGEX);
  });

  it("returns different values on consecutive calls", () => {
    const a = createUuid();
    const b = createUuid();
    expect(a).not.toBe(b);
  });

  it("generates valid UUID v4 via the fallback path", () => {
    const original = crypto.randomUUID;
    try {
      (crypto as unknown as { randomUUID: undefined }).randomUUID = undefined;
      const uuid = createUuid();
      expect(uuid).toMatch(UUID_V4_REGEX);
    } finally {
      crypto.randomUUID = original;
    }
  });
});

describe("ensureUserId", () => {
  it("returns existing userId and isNew: false", () => {
    const existingId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
    const result = ensureUserId({ userId: existingId });

    expect(result.userId).toBe(existingId);
    expect(result.isNew).toBe(false);
    expect(result.state.userId).toBe(existingId);
  });

  it("creates a new userId when state is empty", () => {
    const result = ensureUserId({});

    expect(result.userId).toMatch(UUID_V4_REGEX);
    expect(result.isNew).toBe(true);
    expect(result.state.userId).toBe(result.userId);
  });

  it("preserves other state fields when creating a new userId", () => {
    const result = ensureUserId({ lastPingDate: "2026-03-31" });

    expect(result.isNew).toBe(true);
    expect(result.state.lastPingDate).toBe("2026-03-31");
    expect(result.state.userId).toBe(result.userId);
  });

  it("does not modify the original state object", () => {
    const original = { lastPingDate: "2026-03-31" };
    ensureUserId(original);

    expect(original).toEqual({ lastPingDate: "2026-03-31" });
  });
});
