import type { ModEvent } from "./types";
import { sendPayload } from "./transport";

const MAX_QUEUE_SIZE = 1000;
const MAX_EVENT_BYTES = 8 * 1024;
const MAX_PERSISTED_EVENTS = 500;
const PERSIST_DEBOUNCE_MS = 5000;

type PersistQueue = (events: ModEvent[]) => Promise<void>;

export function capForPersistence(events: ModEvent[]): ModEvent[] {
  if (events.length <= MAX_PERSISTED_EVENTS) return events;
  return events.slice(events.length - MAX_PERSISTED_EVENTS);
}

function capQueue(events: ModEvent[], debug: boolean): void {
  if (events.length <= MAX_QUEUE_SIZE) return;

  if (debug) {
    console.warn("[moderok] Queue full.");
  }

  events.splice(0, events.length - MAX_QUEUE_SIZE);
}

export class EventQueue {
  private queue: ModEvent[] = [];
  private flushPromise: Promise<void> | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly appKey: string,
    private readonly endpoint: string,
    private readonly batchSize: number,
    private readonly flushInterval: number,
    private readonly debug: boolean,
    private readonly persistQueue: PersistQueue,
  ) {}

  start(): void {
    if (this.flushInterval <= 0 || this.flushTimer) return;
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, this.flushInterval);
  }

  recover(events: ModEvent[]): void {
    if (!events.length) return;
    this.queue = [...events, ...this.queue];
    capQueue(this.queue, this.debug);
  }

  get size(): number {
    return this.queue.length;
  }

  snapshot(): ModEvent[] {
    return capForPersistence(this.queue);
  }

  enqueue(event: ModEvent): void {
    const json = JSON.stringify(event);
    if (new TextEncoder().encode(json).length > MAX_EVENT_BYTES) {
      if (this.debug) {
        console.warn("[moderok] Event too large.", event.name);
      }
      return;
    }

    this.queue.push(event);
    capQueue(this.queue, this.debug);

    if (this.debug) {
      console.debug(`[moderok] Enqueued "${event.name}" (queue size: ${this.queue.length})`);
    }

    this.schedulePersist();

    if (this.queue.length >= this.batchSize) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.flushPromise) return this.flushPromise;

    this.flushPromise = this.flushLoop().finally(() => {
      this.flushPromise = null;
    });

    return this.flushPromise;
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = null;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = null;
    await this.flush();
    await this.persistQueue(capForPersistence(this.queue));
  }

  private async flushLoop(): Promise<void> {
    while (this.queue.length) {
      const batch = this.queue.slice(0, this.batchSize);
      if (this.debug) {
        console.debug(`[moderok] Flushing batch of ${batch.length} event(s)…`);
      }

      const result = await sendPayload(
        this.endpoint,
        { appKey: this.appKey, events: batch, sentAt: Date.now() },
        this.debug,
      );

      if (result.success) {
        if (this.debug) {
          console.debug(`[moderok] Flush succeeded. Remaining in queue: ${this.queue.length - batch.length}`);
        }
        this.queue = this.queue.slice(batch.length);
        await this.persistQueue(capForPersistence(this.queue));
        continue;
      }

      if (result.retryable) {
        await this.persistQueue(capForPersistence(this.queue));
        return;
      }

      this.queue = this.queue.slice(batch.length);
      if (this.debug) {
        console.warn("[moderok] Dropped batch.", result.status);
      }
      await this.persistQueue(capForPersistence(this.queue));
    }
  }

  private schedulePersist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.persistQueue(capForPersistence(this.queue));
    }, PERSIST_DEBOUNCE_MS);
  }
}
