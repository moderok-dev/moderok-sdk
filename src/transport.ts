import type { FlushPayload, TransportResult } from "./types";

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

    if (response.status >= 500) {
      if (debug && typeof console !== "undefined") {
        console.warn(`[moderok] Transport failed with retryable status ${response.status}.`);
      }
      return { success: false, retryable: true, status: response.status };
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
