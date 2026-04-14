import { afterEach, describe, expect, it, vi } from "vitest";
import { buildLastErrorProperties, buildManualErrorProperties, ErrorTracker } from "../errors";

describe("buildManualErrorProperties", () => {
  it("normalizes an Error into flat event properties", () => {
    const properties = buildManualErrorProperties(new TypeError("boom"), {
      component: "popup",
      action: "save",
    });

    expect(properties).toMatchObject({
      kind: "manual",
      handled: true,
      error_name: "TypeError",
      message: "boom",
      component: "popup",
      action: "save",
    });
    expect(properties?.fingerprint).toEqual(expect.any(String));
  });
});

describe("buildLastErrorProperties", () => {
  it("builds a runtime_last_error payload", () => {
    const properties = buildLastErrorProperties("tabs.query", { message: "No tab found." }, {
      component: "background",
    });

    expect(properties).toMatchObject({
      kind: "runtime_last_error",
      handled: true,
      message: "No tab found.",
      runtime_api: "tabs.query",
      component: "background",
    });
  });

  it("returns null when lastError is absent", () => {
    expect(buildLastErrorProperties("tabs.query", undefined)).toBeNull();
  });
});

describe("ErrorTracker", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("captures uncaught errors from the global target", () => {
    const target = new EventTarget();
    const emitted: Array<Record<string, string | number | boolean>> = [];
    const tracker = new ErrorTracker({
      autoCapture: true,
      captureConsoleErrors: false,
      onEvent: (properties) => emitted.push(properties),
      target,
    });

    tracker.start();

    const event = new Event("error") as Event & {
      message?: string;
      filename?: string;
      lineno?: number;
      colno?: number;
      error?: Error;
    };
    Object.assign(event, {
      message: "boom",
      filename: "popup.js",
      lineno: 12,
      colno: 4,
      error: new TypeError("boom"),
    });

    target.dispatchEvent(event);

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      kind: "uncaught_exception",
      handled: false,
      error_name: "TypeError",
      message: "boom",
      filename: "popup.js",
      line: 12,
      column: 4,
    });
  });

  it("captures unhandled promise rejections from the global target", () => {
    const target = new EventTarget();
    const emitted: Array<Record<string, string | number | boolean>> = [];
    const tracker = new ErrorTracker({
      autoCapture: true,
      captureConsoleErrors: false,
      onEvent: (properties) => emitted.push(properties),
      target,
    });

    tracker.start();

    const event = new Event("unhandledrejection") as Event & {
      reason?: Error;
    };
    Object.assign(event, {
      reason: new Error("async boom"),
    });

    target.dispatchEvent(event);

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      kind: "unhandled_rejection",
      handled: false,
      error_name: "Error",
      message: "async boom",
    });
    expect(emitted[0].fingerprint).toEqual(expect.any(String));
  });

  it("deduplicates repeated errors inside the suppression window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-02T12:00:00Z"));

    const target = new EventTarget();
    const emitted: Array<Record<string, string | number | boolean>> = [];
    const tracker = new ErrorTracker({
      autoCapture: true,
      captureConsoleErrors: false,
      onEvent: (properties) => emitted.push(properties),
      target,
    });

    tracker.start();

    const first = new Event("error") as Event & { message?: string };
    Object.assign(first, { message: "same-error" });
    const second = new Event("error") as Event & { message?: string };
    Object.assign(second, { message: "same-error" });

    target.dispatchEvent(first);
    target.dispatchEvent(second);

    expect(emitted).toHaveLength(1);
  });

  it("optionally patches console.error", () => {
    const emitted: Array<Record<string, string | number | boolean>> = [];
    const consoleRef = {
      error: vi.fn(),
      warn: vi.fn(),
    };

    const tracker = new ErrorTracker({
      autoCapture: true,
      captureConsoleErrors: true,
      onEvent: (properties) => emitted.push(properties),
      consoleRef,
      target: new EventTarget(),
    });

    tracker.start();
    consoleRef.error("console boom");

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      kind: "console_error",
      handled: true,
      message: "console boom",
    });

    tracker.dispose();
  });

  it("no-ops when the global target is not an EventTarget", () => {
    const tracker = new ErrorTracker({
      autoCapture: true,
      captureConsoleErrors: false,
      onEvent: () => {},
      target: {} as EventTarget,
    });

    expect(() => tracker.start()).not.toThrow();
  });
});
