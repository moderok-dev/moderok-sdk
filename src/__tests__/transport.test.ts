import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sendPayload } from "../transport";
import type { FlushPayload } from "../types";

let nextStatus = 200;
let shouldThrow = false;
let lastHeaders: HeadersInit | undefined;
let lastBody = "";
const originalFetch = globalThis.fetch;

function makePayload(): FlushPayload {
  return {
    appKey: "mk_test_key_12345",
    sentAt: Date.now(),
    events: [
      {
        id: crypto.randomUUID(),
        name: "test_event",
        timestamp: Date.now(),
        userId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        context: {
          sdkVersion: "0.1.0",
          extensionId: "test-ext-id",
          extensionVersion: "1.0.0",
          browser: "chrome",
          browserVersion: "131.0.0.0",
          os: "MacOS",
          locale: "en-US",
          source: "background",
        },
      },
    ],
  };
}

beforeEach(() => {
  globalThis.fetch = vi.fn(async (_input, init) => {
    if (shouldThrow) {
      throw new Error("network down");
    }

    lastHeaders = init?.headers;
    lastBody = typeof init?.body === "string" ? init.body : "";
    return new Response(null, { status: nextStatus });
  }) as typeof fetch;
});

afterEach(() => {
  nextStatus = 200;
  shouldThrow = false;
  lastHeaders = undefined;
  lastBody = "";
  globalThis.fetch = originalFetch;
});

describe("sendPayload", () => {
  it("returns success for 200", async () => {
    nextStatus = 200;
    const result = await sendPayload("https://api.moderok.dev/v1/events", makePayload(), false);
    expect(result).toEqual({ success: true });
  });

  it("returns success for 202", async () => {
    nextStatus = 202;
    const result = await sendPayload("https://api.moderok.dev/v1/events", makePayload(), false);
    expect(result).toEqual({ success: true });
  });

  it("returns non-retryable for 400", async () => {
    nextStatus = 400;
    const result = await sendPayload("https://api.moderok.dev/v1/events", makePayload(), false);
    expect(result).toEqual({ success: false, retryable: false, status: 400 });
  });

  it("returns non-retryable for 403", async () => {
    nextStatus = 403;
    const result = await sendPayload("https://api.moderok.dev/v1/events", makePayload(), false);
    expect(result).toEqual({ success: false, retryable: false, status: 403 });
  });

  it("returns non-retryable for 429", async () => {
    nextStatus = 429;
    const result = await sendPayload("https://api.moderok.dev/v1/events", makePayload(), false);
    expect(result).toEqual({ success: false, retryable: false, status: 429 });
  });

  it("returns retryable for 500", async () => {
    nextStatus = 500;
    const result = await sendPayload("https://api.moderok.dev/v1/events", makePayload(), false);
    expect(result).toEqual({ success: false, retryable: true, status: 500 });
  });

  it("returns retryable for 502", async () => {
    nextStatus = 502;
    const result = await sendPayload("https://api.moderok.dev/v1/events", makePayload(), false);
    expect(result).toEqual({ success: false, retryable: true, status: 502 });
  });

  it("returns retryable for 503", async () => {
    nextStatus = 503;
    const result = await sendPayload("https://api.moderok.dev/v1/events", makePayload(), false);
    expect(result).toEqual({ success: false, retryable: true, status: 503 });
  });

  it("returns retryable on network error", async () => {
    shouldThrow = true;
    const result = await sendPayload("https://api.moderok.dev/v1/events", makePayload(), false);
    expect(result.success).toBe(false);
    expect(result.retryable).toBe(true);
  });

  it("sends Content-Type: text/plain;charset=UTF-8", async () => {
    nextStatus = 200;
    await sendPayload("https://api.moderok.dev/v1/events", makePayload(), false);
    expect((lastHeaders as Record<string, string>)["Content-Type"]).toBe("text/plain;charset=UTF-8");
  });

  it("sends the payload as JSON in the request body", async () => {
    nextStatus = 200;
    const payload = makePayload();
    await sendPayload("https://api.moderok.dev/v1/events", payload, false);

    const parsed = JSON.parse(lastBody);
    expect(parsed.appKey).toBe("mk_test_key_12345");
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0].name).toBe("test_event");
  });
});
