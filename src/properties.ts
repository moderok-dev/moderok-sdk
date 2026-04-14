import type { EventProperties, EventPropertyValue } from "./types";

function debugLog(enabled: boolean, level: "warn", message: string): void {
  if (!enabled) return;
  console[level](`[moderok] ${message}`);
}

export function sanitizeProperties(input?: Record<string, unknown>, debug = false): EventProperties | undefined {
  if (!input) return undefined;

  const clean: EventProperties = {};
  for (const [key, value] of Object.entries(input)) {
    if (
      typeof value === "string" ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    ) {
      clean[key] = value as EventPropertyValue;
      continue;
    }

    debugLog(debug, "warn", `Dropped unsupported event property "${key}".`);
  }

  return Object.keys(clean).length ? clean : undefined;
}
