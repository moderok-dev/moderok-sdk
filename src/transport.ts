import type { FlushPayload, TransportResult } from "./types";

// Retry-After can be delta-seconds or an HTTP-date.
function parseRetryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    return Math.max(0, date - Date.now());
  }
  return undefined;
}

export async function sendPayload(
  endpoint: string,
  payload: FlushPayload,
  debug: boolean,
): Promise<TransportResult> {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=UTF-8",
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      if (debug && typeof console !== "undefined") {
        console.debug(`[moderok] Transport accepted payload (${response.status}).`);
      }
      return { success: true };
    }

    // 429 (usage cap or rate limit) is retryable: the events are valid, the
    // server just can't take them right now. Dropping them here would erase
    // whole user-days permanently during capped windows.
    if (response.status >= 500 || response.status === 429) {
      if (debug && typeof console !== "undefined") {
        console.warn(`[moderok] Transport failed with retryable status ${response.status}.`);
      }
      return {
        success: false,
        retryable: true,
        status: response.status,
        retryAfterMs: parseRetryAfterMs(response.headers.get("Retry-After")),
      };
    }

    if (debug && typeof console !== "undefined") {
      console.warn(`[moderok] Transport failed with non-retryable status ${response.status}.`);
    }
    return { success: false, retryable: false, status: response.status };
  } catch (error) {
    if (debug && typeof console !== "undefined") {
      console.warn("[moderok] Transport failed due to a network error.", error);
    }

    return { success: false, retryable: true };
  }
}
