import { describe, it, expect } from "vitest";
import { normalizeConfig } from "../index";

describe("normalizeConfig", () => {
  it("fills all defaults from a minimal config", () => {
    const result = normalizeConfig({ appKey: "mk_test_key_12345" });

    expect(result).toEqual({
      appKey: "mk_test_key_12345",
      endpoint: "https://api.moderok.dev/v1/events",
      flushInterval: 30000,
      batchSize: 20,
      debug: false,
      trackUninstalls: false,
      trackErrors: true,
      captureConsoleErrors: false,
      uninstallUrl: undefined,
    });
  });

  it("clamps batchSize to minimum of 1", () => {
    const result = normalizeConfig({ appKey: "mk_test_key_12345", batchSize: 0 });
    expect(result.batchSize).toBe(1);
  });

  it("clamps batchSize to maximum of 1000", () => {
    const result = normalizeConfig({ appKey: "mk_test_key_12345", batchSize: 5000 });
    expect(result.batchSize).toBe(1000);
  });

  it("floors fractional batchSize", () => {
    const result = normalizeConfig({ appKey: "mk_test_key_12345", batchSize: 3.7 });
    expect(result.batchSize).toBe(3);
  });

  it("clamps negative flushInterval to 0", () => {
    const result = normalizeConfig({ appKey: "mk_test_key_12345", flushInterval: -100 });
    expect(result.flushInterval).toBe(0);
  });

  it("floors fractional flushInterval", () => {
    const result = normalizeConfig({ appKey: "mk_test_key_12345", flushInterval: 15500.9 });
    expect(result.flushInterval).toBe(15500);
  });

  it("preserves a custom endpoint", () => {
    const result = normalizeConfig({
      appKey: "mk_test_key_12345",
      endpoint: "https://custom.example.com/v1/events",
    });
    expect(result.endpoint).toBe("https://custom.example.com/v1/events");
  });

  it("coerces debug to boolean", () => {
    expect(normalizeConfig({ appKey: "mk_test_key_12345", debug: undefined }).debug).toBe(false);
    expect(normalizeConfig({ appKey: "mk_test_key_12345", debug: true }).debug).toBe(true);
  });

  it("enables automatic error tracking by default", () => {
    expect(normalizeConfig({ appKey: "mk_test_key_12345" }).trackErrors).toBe(true);
    expect(normalizeConfig({ appKey: "mk_test_key_12345", trackErrors: false }).trackErrors).toBe(false);
  });

  it("keeps console error capture opt-in", () => {
    expect(normalizeConfig({ appKey: "mk_test_key_12345" }).captureConsoleErrors).toBe(false);
    expect(normalizeConfig({ appKey: "mk_test_key_12345", captureConsoleErrors: true }).captureConsoleErrors).toBe(true);
  });

  it("preserves uninstallUrl when provided", () => {
    const result = normalizeConfig({
      appKey: "mk_test_key_12345",
      uninstallUrl: "https://myext.com/uninstalled",
    });
    expect(result.uninstallUrl).toBe("https://myext.com/uninstalled");
  });

  it("handles negative batchSize", () => {
    const result = normalizeConfig({ appKey: "mk_test_key_12345", batchSize: -10 });
    expect(result.batchSize).toBe(1);
  });
});
