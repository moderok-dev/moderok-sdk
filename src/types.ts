export type EventPropertyValue = string | number | boolean;
export type EventProperties = Record<string, EventPropertyValue>;

export interface InitConfig {
  appKey: string;
  endpoint?: string;
  flushInterval?: number;
  batchSize?: number;
  debug?: boolean;
  trackUninstalls?: boolean;
  uninstallUrl?: string;
  trackErrors?: boolean;
  captureConsoleErrors?: boolean;
}

export interface EventContext {
  sdkVersion: string;
  extensionId: string;
  extensionVersion: string;
  browser: "chrome" | "edge" | "firefox" | "other_chromium" | "unknown";
  browserVersion: string;
  os: "Windows" | "MacOS" | "Linux" | "ChromeOS" | "Android" | "unknown";
  locale: string;
  source:
    | "background"
    | "content_script"
    | "popup"
    | "options"
    | "side_panel"
    | "extension_page"
    | "unknown";
}

export interface ModEvent {
  id: string;
  name: string;
  properties?: EventProperties;
  timestamp: number;
  userId: string;
  context: EventContext;
}

export interface ResolvedConfig {
  appKey: string;
  endpoint: string;
  flushInterval: number;
  batchSize: number;
  debug: boolean;
  trackUninstalls: boolean;
  trackErrors: boolean;
  captureConsoleErrors: boolean;
  uninstallUrl?: string;
}

export interface PersistedState {
  userId?: string;
  lastPingDate?: string;
  pendingEvents?: ModEvent[];
  config?: ResolvedConfig;
}

export interface FlushPayload {
  appKey: string;
  events: ModEvent[];
  sentAt: number;
}

export interface TransportResult {
  success: boolean;
  retryable?: boolean;
  status?: number;
}
