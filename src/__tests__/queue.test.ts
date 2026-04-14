import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { capForPersistence, EventQueue } from "../queue";
import type { ModEvent, EventContext } from "../types";

function makeEvent(overrides: Partial<ModEvent> = {}): ModEvent {
  return {
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
    ...overrides,
  };
}

function makeEvents(count: number): ModEvent[] {
  return Array.from({ length: count }, (_, i) =>
    makeEvent({ name: `event_${i}` }),
  );
}

describe("capForPersistence", () => {
  it("returns array unchanged when under 500", () => {
    const events = makeEvents(100);
    const result = capForPersistence(events);
    expect(result).toBe(events); // same reference
    expect(result).toHaveLength(100);
  });

  it("returns exactly 500 when at the limit", () => {
    const events = makeEvents(500);
    const result = capForPersistence(events);
    expect(result).toBe(events);
    expect(result).toHaveLength(500);
  });

  it("trims to the last 500 events when over the limit", () => {
    const events = makeEvents(600);
    const result = capForPersistence(events);
    expect(result).toHaveLength(500);
    // Should keep the last 500 (indices 100-599)
    expect(result[0].name).toBe("event_100");
    expect(result[499].name).toBe("event_599");
  });
});

describe("EventQueue", () => {
  let persistedEvents: ModEvent[];
  const noopPersist = async () => {};
  const capturePersist = async (events: ModEvent[]) => {
    persistedEvents = events;
  };

  beforeEach(() => {
    persistedEvents = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects events larger than 8KB", () => {
    const queue = new EventQueue("mk_test", "http://localhost", 20, 0, false, noopPersist);
    const hugeEvent = makeEvent({
      properties: { payload: "x".repeat(10_000) },
    });

    queue.enqueue(hugeEvent);
    expect(queue.size).toBe(0);
  });

  it("accepts events just under 8KB", () => {
    const queue = new EventQueue("mk_test", "http://localhost", 20, 0, false, noopPersist);
    const event = makeEvent();
    queue.enqueue(event);
    expect(queue.size).toBe(1);
  });

  it("trims queue to 1000 when overfilled", () => {
    const queue = new EventQueue("mk_test", "http://localhost", 2000, 0, false, noopPersist);

    for (let i = 0; i < 1001; i++) {
      queue.enqueue(makeEvent({ name: `event_${i}` }));
    }

    expect(queue.size).toBe(1000);
  });

  it("recover() prepends persisted events to the queue", () => {
    const queue = new EventQueue("mk_test", "http://localhost", 20, 0, false, noopPersist);
    const fresh = makeEvent({ name: "fresh" });
    queue.enqueue(fresh);

    const recovered = [makeEvent({ name: "recovered_0" }), makeEvent({ name: "recovered_1" })];
    queue.recover(recovered);

    const snapshot = queue.snapshot();
    expect(snapshot[0].name).toBe("recovered_0");
    expect(snapshot[1].name).toBe("recovered_1");
    expect(snapshot[2].name).toBe("fresh");
  });

  it("snapshot() caps at 500 events", () => {
    const queue = new EventQueue("mk_test", "http://localhost", 2000, 0, false, noopPersist);
    for (let i = 0; i < 700; i++) {
      queue.enqueue(makeEvent());
    }

    const snapshot = queue.snapshot();
    expect(snapshot).toHaveLength(500);
  });

  it("shutdown() persists remaining events", async () => {
    const queue = new EventQueue("mk_test", "http://localhost", 2000, 0, false, capturePersist);
    queue.enqueue(makeEvent({ name: "leftover" }));

    await queue.shutdown();

    expect(persistedEvents).toHaveLength(1);
    expect(persistedEvents[0].name).toBe("leftover");
  });
});
