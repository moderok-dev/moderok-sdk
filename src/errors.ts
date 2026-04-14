import { sanitizeProperties } from "./properties";
import type { EventProperties } from "./types";

export type ErrorKind =
  | "uncaught_exception"
  | "unhandled_rejection"
  | "manual"
  | "runtime_last_error"
  | "console_error";

type MaybeErrorEvent = Event & {
  message?: unknown;
  filename?: unknown;
  lineno?: unknown;
  colno?: unknown;
  error?: unknown;
};

type MaybeRejectionEvent = Event & {
  reason?: unknown;
};

type LastErrorLike = {
  message?: string;
} | null | undefined;

type ErrorTrackerOptions = {
  autoCapture: boolean;
  captureConsoleErrors: boolean;
  debug?: boolean;
  onEvent: (properties: EventProperties) => void;
  target?: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  consoleRef?: Pick<Console, "error" | "warn">;
};

function isEventTargetLike(
  value: unknown,
): value is Pick<EventTarget, "addEventListener" | "removeEventListener"> {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { addEventListener?: unknown }).addEventListener === "function" &&
    typeof (value as { removeEventListener?: unknown }).removeEventListener === "function"
  );
}

const MAX_MESSAGE_LENGTH = 500;
const MAX_STACK_LENGTH = 1800;
const MAX_FILENAME_LENGTH = 300;
const DEDUPE_WINDOW_MS = 60_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_EVENTS = 20;
const MAX_DEDUPE_KEYS = 100;

function truncate(value: string | undefined, maxLength: number): string | undefined {
  if (!value) return undefined;
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function normalizeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringifyUnknown(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  if (value instanceof Error) {
    return value.message || value.name;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function hashString(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeErrorLike(error: unknown): {
  errorName?: string;
  message?: string;
  stack?: string;
} {
  if (error instanceof Error) {
    return {
      errorName: truncate(error.name || "Error", 100),
      message: truncate(error.message || error.name, MAX_MESSAGE_LENGTH),
      stack: truncate(error.stack, MAX_STACK_LENGTH),
    };
  }

  if (typeof error === "object" && error) {
    const maybeRecord = error as { name?: unknown; message?: unknown; stack?: unknown };
    return {
      errorName: truncate(stringifyUnknown(maybeRecord.name), 100),
      message: truncate(stringifyUnknown(maybeRecord.message), MAX_MESSAGE_LENGTH),
      stack: truncate(stringifyUnknown(maybeRecord.stack), MAX_STACK_LENGTH),
    };
  }

  return {
    message: truncate(stringifyUnknown(error), MAX_MESSAGE_LENGTH),
  };
}

function buildFingerprintSeed(
  kind: ErrorKind,
  errorName?: string,
  message?: string,
  stack?: string,
  filename?: string,
  line?: number,
  column?: number,
): string {
  const stackHead = stack?.split("\n").slice(0, 2).join("\n");
  return [
    kind,
    errorName ?? "",
    message ?? "",
    stackHead ?? "",
    filename ?? "",
    line ?? "",
    column ?? "",
  ].join("|");
}

function buildCapturedProperties(
  kind: ErrorKind,
  details: {
    handled: boolean;
    errorName?: string;
    message?: string;
    stack?: string;
    filename?: string;
    line?: number;
    column?: number;
    runtimeApi?: string;
  },
  extra?: Record<string, unknown>,
): EventProperties | null {
  const extraProperties = sanitizeProperties(extra);
  const fingerprintSeed = buildFingerprintSeed(
    kind,
    details.errorName,
    details.message,
    details.stack,
    details.filename,
    details.line,
    details.column,
  );

  if (!details.message && !details.stack && !details.filename && !details.errorName) {
    return null;
  }

  const properties: EventProperties = {
    ...(extraProperties ?? {}),
    kind,
    handled: details.handled,
    fingerprint: hashString(fingerprintSeed),
  };

  if (details.errorName) properties.error_name = details.errorName;
  if (details.message) properties.message = details.message;
  if (details.stack) properties.stack = details.stack;
  if (details.filename) properties.filename = details.filename;
  if (details.line !== undefined) properties.line = details.line;
  if (details.column !== undefined) properties.column = details.column;
  if (details.runtimeApi) properties.runtime_api = details.runtimeApi;

  return properties;
}

export function buildManualErrorProperties(error: unknown, extra?: Record<string, unknown>): EventProperties | null {
  return buildCapturedProperties(
    "manual",
    {
      handled: true,
      ...normalizeErrorLike(error),
    },
    extra,
  );
}

export function buildLastErrorProperties(
  apiName: string,
  lastError: LastErrorLike,
  extra?: Record<string, unknown>,
): EventProperties | null {
  if (!lastError?.message) return null;

  return buildCapturedProperties(
    "runtime_last_error",
    {
      handled: true,
      message: truncate(lastError.message, MAX_MESSAGE_LENGTH),
      runtimeApi: truncate(apiName, 120),
    },
    extra,
  );
}

function buildConsoleErrorProperties(args: unknown[]): EventProperties | null {
  const message = truncate(
    args
      .map((value) => stringifyUnknown(value))
      .filter((value): value is string => !!value)
      .join(" "),
    MAX_MESSAGE_LENGTH,
  );

  if (!message) return null;

  const firstError = args.find((value) => value instanceof Error);
  return buildCapturedProperties(
    "console_error",
    {
      handled: true,
      ...normalizeErrorLike(firstError ?? message),
    },
  );
}

function buildErrorEventProperties(event: MaybeErrorEvent): EventProperties | null {
  const normalized = normalizeErrorLike(event.error ?? event.message);
  return buildCapturedProperties("uncaught_exception", {
    handled: false,
    ...normalized,
    message: normalized.message ?? truncate(stringifyUnknown(event.message), MAX_MESSAGE_LENGTH),
    filename: truncate(stringifyUnknown(event.filename), MAX_FILENAME_LENGTH),
    line: normalizeNumber(event.lineno),
    column: normalizeNumber(event.colno),
  });
}

function buildUnhandledRejectionProperties(event: MaybeRejectionEvent): EventProperties | null {
  return buildCapturedProperties(
    "unhandled_rejection",
    {
      handled: false,
      ...normalizeErrorLike(event.reason),
    },
  );
}

export class ErrorTracker {
  private readonly target: Pick<EventTarget, "addEventListener" | "removeEventListener"> | undefined;
  private readonly consoleRef: Pick<Console, "error" | "warn">;
  private readonly fingerprints = new Map<string, number>();
  private readonly rateLimitTimestamps: number[] = [];
  private teardown: Array<() => void> = [];

  constructor(private readonly options: ErrorTrackerOptions) {
    this.target = isEventTargetLike(options.target)
      ? options.target
      : isEventTargetLike(globalThis)
        ? globalThis
        : undefined;
    this.consoleRef = options.consoleRef ?? console;
  }

  start(): void {
    if (!this.options.autoCapture) return;
    if (!this.target) return;
    if (this.teardown.length) return;

    const onError = (event: Event): void => {
      this.emit(buildErrorEventProperties(event as MaybeErrorEvent));
    };

    const onUnhandledRejection = (event: Event): void => {
      this.emit(buildUnhandledRejectionProperties(event as MaybeRejectionEvent));
    };

    this.target.addEventListener("error", onError);
    this.target.addEventListener("unhandledrejection", onUnhandledRejection);
    this.teardown.push(() => this.target?.removeEventListener("error", onError));
    this.teardown.push(() => this.target?.removeEventListener("unhandledrejection", onUnhandledRejection));

    if (this.options.captureConsoleErrors) {
      const originalError = this.consoleRef.error.bind(this.consoleRef);
      this.consoleRef.error = ((...args: unknown[]) => {
        this.emit(buildConsoleErrorProperties(args));
        originalError(...args);
      }) as typeof console.error;

      this.teardown.push(() => {
        this.consoleRef.error = originalError as typeof console.error;
      });
    }
  }

  dispose(): void {
    for (const cleanup of this.teardown.splice(0).reverse()) {
      cleanup();
    }
  }

  captureError(error: unknown, extra?: Record<string, unknown>): void {
    this.emit(buildManualErrorProperties(error, extra));
  }

  captureLastError(apiName: string, lastError: LastErrorLike, extra?: Record<string, unknown>): void {
    this.emit(buildLastErrorProperties(apiName, lastError, extra));
  }

  private emit(properties: EventProperties | null): void {
    if (!properties) return;

    const now = Date.now();
    const fingerprint = properties.fingerprint;
    if (typeof fingerprint === "string") {
      this.prune(now);

      const lastSeen = this.fingerprints.get(fingerprint);
      if (lastSeen && now - lastSeen < DEDUPE_WINDOW_MS) {
        return;
      }

      if (this.rateLimitTimestamps.length >= RATE_LIMIT_MAX_EVENTS) {
        if (this.options.debug) {
          this.consoleRef.warn("[moderok] Dropped error event due to rate limiting.");
        }
        return;
      }

      this.fingerprints.set(fingerprint, now);
      this.rateLimitTimestamps.push(now);

      if (this.fingerprints.size > MAX_DEDUPE_KEYS) {
        const oldestKey = this.fingerprints.keys().next().value;
        if (oldestKey) this.fingerprints.delete(oldestKey);
      }
    }

    try {
      this.options.onEvent(properties);
    } catch {
      // don't throw from error tracking
    }
  }

  private prune(now: number): void {
    while (this.rateLimitTimestamps.length && now - this.rateLimitTimestamps[0] >= RATE_LIMIT_WINDOW_MS) {
      this.rateLimitTimestamps.shift();
    }

    for (const [fingerprint, timestamp] of this.fingerprints.entries()) {
      if (now - timestamp >= DEDUPE_WINDOW_MS) {
        this.fingerprints.delete(fingerprint);
      }
    }
  }
}
