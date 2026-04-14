import { collectContext } from "./context";
import { buildLastErrorProperties, buildManualErrorProperties, ErrorTracker } from "./errors";
import { createUuid, ensureUserId } from "./identity";
import { registerOnInstalled } from "./lifecycle";
import { sanitizeProperties } from "./properties";
import { EventQueue } from "./queue";
import { loadIdentityFromSync, loadState, saveIdentityToSync, saveState } from "./storage";
import type { EventProperties, InitConfig, ModEvent, PersistedState, ResolvedConfig } from "./types";

const DEFAULT_ENDPOINT = "https://api.moderok.dev/v1/events";
const DEFAULT_FLUSH_INTERVAL = 30000;
const DEFAULT_BATCH_SIZE = 20;

type DraftEvent = {
  id: string;
  name: string;
  properties?: EventProperties;
  timestamp: number;
};

export function utcDateStamp(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function debugLog(enabled: boolean, level: "debug" | "warn" | "error", message: string): void {
  if (!enabled && level !== "error") return;
  console[level](`[moderok] ${message}`);
}

export function normalizeConfig(config: InitConfig): ResolvedConfig {
  return {
    appKey: config.appKey,
    endpoint: config.endpoint ?? DEFAULT_ENDPOINT,
    flushInterval: Math.max(0, Math.floor(config.flushInterval ?? DEFAULT_FLUSH_INTERVAL)),
    batchSize: Math.max(1, Math.min(1000, Math.floor(config.batchSize ?? DEFAULT_BATCH_SIZE))),
    debug: !!config.debug,
    trackUninstalls: !!config.trackUninstalls,
    trackErrors: config.trackErrors !== false,
    captureConsoleErrors: !!config.captureConsoleErrors,
    uninstallUrl: config.uninstallUrl,
  };
}

export function buildUninstallUrl(config: ResolvedConfig, userId: string): string | null {
  try {
    const url = new URL(config.endpoint);
    url.pathname = url.pathname.replace(/\/[^/]*$/, "/uninstall");
    url.searchParams.set("app", config.appKey);
    url.searchParams.set("uid", userId);
    if (config.uninstallUrl) {
      url.searchParams.set("redirect", config.uninstallUrl);
    }
    return url.toString();
  } catch {
    return null;
  }
}

class ModerokClient {
  private config: ResolvedConfig | null = null;
  private initStarted = false;
  private bootstrapped = false;
  private autoInitAttempted = false;
  private context = collectContext();
  private userId = "";
  private pendingLifecycle: chrome.runtime.InstalledDetails | null = null;
  private drafts: DraftEvent[] = [];
  private state: PersistedState = {};
  private queue: EventQueue | null = null;
  private errorTracker: ErrorTracker | null = null;

  init(config: InitConfig): void {
    const nextConfig = normalizeConfig(config);

    registerOnInstalled((details) => {
      if (!this.bootstrapped) {
        this.pendingLifecycle = details;
        return;
      }
      this.handleLifecycle(details);
    });

    if (!nextConfig.appKey) {
      debugLog(nextConfig.debug, "error", "Missing appKey.");
      return;
    }

    if (this.initStarted) {
      debugLog(nextConfig.debug, "debug", "init() called again — skipping.");
      return;
    }

    this.initStarted = true;
    this.config = nextConfig;
    debugLog(nextConfig.debug, "debug", `Initializing with appKey="${nextConfig.appKey}".`);
    this.errorTracker = new ErrorTracker({
      autoCapture: nextConfig.trackErrors,
      captureConsoleErrors: nextConfig.trackErrors && nextConfig.captureConsoleErrors,
      debug: nextConfig.debug,
      onEvent: (properties) => {
        this.track("__error", properties);
      },
    });
    this.errorTracker.start();

    this.queue = new EventQueue(
      nextConfig.appKey,
      nextConfig.endpoint,
      nextConfig.batchSize,
      nextConfig.flushInterval,
      nextConfig.debug,
      async (pendingEvents) => {
        this.state = { ...this.state, pendingEvents: pendingEvents.length ? pendingEvents : undefined };
        await saveState(this.state);
      },
    );

    this.queue.start();
    void this.bootstrap();
  }

  track(name: string, properties?: Record<string, unknown>): void {
    if (!this.initStarted || !this.config) {
      this.drafts.push({
        id: createUuid(),
        name,
        properties: sanitizeProperties(properties),
        timestamp: Date.now(),
      });

      if (!this.autoInitAttempted) {
        this.autoInitAttempted = true;
        debugLog(false, "debug", `track("${name}") called before init() — attempting auto-init from stored config.`);
        void this.autoInit();
      }
      return;
    }

    debugLog(this.config.debug, "debug", `track("${name}")`);

    const draft: DraftEvent = {
      id: createUuid(),
      name,
      properties: sanitizeProperties(properties, this.config.debug),
      timestamp: Date.now(),
    };

    if (!this.bootstrapped || !this.queue) {
      debugLog(this.config.debug, "debug", `  ↳ Buffered as draft (bootstrap not complete yet).`);
      this.drafts.push(draft);
      return;
    }

    this.queue.enqueue(this.makeEvent(draft.name, draft.timestamp, draft.properties, draft.id));
  }

  private async autoInit(): Promise<void> {
    try {
      const state = await loadState();
      if (state?.config?.appKey && !this.initStarted) {
        debugLog(state.config.debug, "debug", "Auto-initializing from stored config.");
        this.init(state.config);
      }
    } catch {
      // no stored config
    }
  }

  async flush(): Promise<void> {
    if (!this.queue) return;
    if (this.bootstrapped && this.drafts.length) this.flushDrafts();
    await this.queue.flush();
  }

  async shutdown(): Promise<void> {
    this.errorTracker?.dispose();
    if (!this.queue) return;
    if (this.bootstrapped && this.drafts.length) this.flushDrafts();
    await this.queue.shutdown();
  }

  isInitialized(): boolean {
    return this.initStarted;
  }

  captureError(error: unknown, properties?: Record<string, unknown>): void {
    if (this.errorTracker) {
      this.errorTracker.captureError(error, properties);
      return;
    }

    const normalized = buildManualErrorProperties(error, properties);
    if (normalized) {
      this.track("__error", normalized);
    }
  }

  captureLastError(
    apiName: string,
    lastError: { message?: string } | null | undefined,
    properties?: Record<string, unknown>,
  ): void {
    if (this.errorTracker) {
      this.errorTracker.captureLastError(apiName, lastError, properties);
      return;
    }

    const normalized = buildLastErrorProperties(apiName, lastError, properties);
    if (normalized) {
      this.track("__error", normalized);
    }
  }

  private async bootstrap(): Promise<void> {
    if (!this.config || !this.queue) return;

    debugLog(this.config.debug, "debug", "Bootstrap starting…");

    this.state = await loadState();
    debugLog(this.config.debug, "debug", `  ↳ Loaded state from chrome.storage.local.`);

    // If local has no userId (e.g. fresh install OR ephemeral Chromebook profile
    // wipe), try to recover it from chrome.storage.sync. When Chrome Sync is
    // enabled, sync persists the identity across profile resets via the user's
    // Google account — this prevents phantom installs on school Chromebooks.
    let recoveredFromSync = false;
    if (!this.state.userId) {
      const synced = await loadIdentityFromSync();
      if (synced.userId) {
        this.state = {
          ...this.state,
          userId: synced.userId,
          lastPingDate: this.state.lastPingDate ?? synced.lastPingDate,
        };
        recoveredFromSync = true;
        debugLog(this.config.debug, "debug", `  ↳ Recovered userId from chrome.storage.sync.`);
      }
    }

    const identity = ensureUserId(this.state);
    this.userId = identity.userId;
    this.state = identity.state;
    debugLog(
      this.config.debug,
      "debug",
      `  ↳ User ID: ${this.userId} (${
        identity.isNew ? "new" : recoveredFromSync ? "recovered" : "existing"
      })`,
    );

    this.context = collectContext();
    debugLog(this.config.debug, "debug", `  ↳ Context: ${this.context.browser} ${this.context.browserVersion}, ${this.context.os}, source=${this.context.source}`);
    this.queue.recover(this.state.pendingEvents ?? []);

    if (identity.isNew) {
      this.queue.enqueue(this.makeEvent("__first_open", Date.now()));
    }

    const today = utcDateStamp(Date.now());
    if (this.state.lastPingDate !== today) {
      this.state.lastPingDate = today;
      this.queue.enqueue(this.makeEvent("__daily_ping", Date.now()));
    }

    this.bootstrapped = true;
    debugLog(this.config.debug, "debug", "Bootstrap complete.");

    if (this.pendingLifecycle) {
      this.handleLifecycle(this.pendingLifecycle);
      this.pendingLifecycle = null;
    }

    this.flushDrafts();

    this.state.config = this.config;
    this.state.pendingEvents = this.queue.snapshot();
    await saveState(this.state);

    // Mirror identity to chrome.storage.sync so we can recover it after
    // ephemeral profile wipes. Write-once-per-bootstrap keeps us far inside
    // sync's 120/min rate limit.
    void saveIdentityToSync({
      userId: this.userId,
      lastPingDate: this.state.lastPingDate,
    });

    if (
      this.config.trackUninstalls &&
      typeof chrome !== "undefined" &&
      chrome.runtime?.setUninstallURL
    ) {
      const url = buildUninstallUrl(this.config, this.userId);
      if (!url) {
        debugLog(this.config.debug, "warn", "Invalid endpoint; could not build uninstall URL.");
      } else if (url.length > 1023) {
        debugLog(this.config.debug, "warn", "Uninstall URL too long.");
      } else {
        chrome.runtime.setUninstallURL(url);
      }
    }

    if (this.queue.size) {
      void this.queue.flush();
    }
  }

  private flushDrafts(): void {
    if (!this.queue || !this.bootstrapped) return;
    for (const draft of this.drafts.splice(0)) {
      this.queue.enqueue(this.makeEvent(draft.name, draft.timestamp, draft.properties, draft.id));
    }
  }

  private handleLifecycle(details: chrome.runtime.InstalledDetails): void {
    if (!this.queue) return;
    if (details.reason === "install") {
      this.queue.enqueue(this.makeEvent("__install", Date.now()));
      return;
    }

    if (details.reason === "update") {
      const properties = details.previousVersion ? { previousVersion: details.previousVersion } : undefined;
      this.queue.enqueue(this.makeEvent("__update", Date.now(), properties));
    }
  }

  private makeEvent(name: string, timestamp: number, properties?: EventProperties, id?: string): ModEvent {
    return {
      id: id ?? createUuid(),
      name,
      properties,
      timestamp,
      userId: this.userId,
      context: this.context,
    };
  }
}

const client = new ModerokClient();

export const Moderok = {
  init: (config: InitConfig): void => client.init(config),
  track: (name: string, properties?: Record<string, unknown>): void => client.track(name, properties),
  flush: (): Promise<void> => client.flush(),
  shutdown: (): Promise<void> => client.shutdown(),
  isInitialized: (): boolean => client.isInitialized(),
  captureError: (error: unknown, properties?: Record<string, unknown>): void => client.captureError(error, properties),
  captureLastError: (
    apiName: string,
    lastError: { message?: string } | null | undefined,
    properties?: Record<string, unknown>,
  ): void => client.captureLastError(apiName, lastError, properties),
};

export type {
  EventContext,
  EventProperties,
  EventPropertyValue,
  FlushPayload,
  InitConfig,
  ModEvent,
  PersistedState,
  ResolvedConfig,
  TransportResult,
} from "./types";

export { sanitizeProperties } from "./properties";
