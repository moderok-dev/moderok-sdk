import type { EventContext } from "./types";
import { SDK_VERSION } from "./version";

let cachedContext: EventContext | null = null;

export function parseBrowser(ua: string): Pick<EventContext, "browser" | "browserVersion"> {
  const firefox = /Firefox\/([\d.]+)/.exec(ua);
  if (firefox) return { browser: "firefox", browserVersion: firefox[1] };

  const edge = /Edg\/([\d.]+)/.exec(ua);
  if (edge) return { browser: "edge", browserVersion: edge[1] };

  const chromeMatch = /Chrome\/([\d.]+)/.exec(ua);
  if (!chromeMatch) return { browser: "unknown", browserVersion: "unknown" };

  const browser = /OPR\/|Brave\/|Vivaldi\//.test(ua) ? "other_chromium" : "chrome";
  return { browser, browserVersion: chromeMatch[1] };
}

export function parseOs(platform: string, ua: string): EventContext["os"] {
  const source = `${platform} ${ua}`;
  if (/Android/i.test(source)) return "Android";
  if (/CrOS/i.test(source)) return "ChromeOS";
  if (/Win/i.test(source)) return "Windows";
  if (/Mac/i.test(source)) return "MacOS";
  if (/Linux/i.test(source)) return "Linux";
  return "unknown";
}

function detectSource(): EventContext["source"] {
  if (
    typeof ServiceWorkerGlobalScope !== "undefined" &&
    globalThis instanceof ServiceWorkerGlobalScope
  ) {
    return "background";
  }

  const href = typeof location === "undefined" ? "" : location.href;
  const protocol = typeof location === "undefined" ? "" : location.protocol;

  if (protocol !== "chrome-extension:" && protocol !== "moz-extension:" && protocol !== "extension:") {
    return typeof chrome !== "undefined" && chrome.runtime?.id ? "content_script" : "unknown";
  }

  if (/side[_-]?panel/i.test(href)) return "side_panel";
  if (/options/i.test(href)) return "options";
  if (/popup/i.test(href)) return "popup";
  return "extension_page";
}

export function collectContext(): EventContext {
  if (cachedContext) return cachedContext;

  const nav = typeof navigator === "undefined" ? undefined : navigator;
  const ua = nav?.userAgent ?? "";
  const browser = parseBrowser(ua);
  const extensionId = typeof chrome !== "undefined" && chrome.runtime?.id ? chrome.runtime.id : "unknown";
  const extensionVersion =
    typeof chrome !== "undefined" && chrome.runtime?.getManifest
      ? chrome.runtime.getManifest().version
      : "unknown";

  cachedContext = {
    sdkVersion: SDK_VERSION,
    extensionId,
    extensionVersion,
    browser: browser.browser,
    browserVersion: browser.browserVersion,
    os: parseOs((nav as Navigator & { userAgentData?: { platform?: string } })?.userAgentData?.platform ?? nav?.platform ?? "", ua),
    locale: nav?.language ?? "unknown",
    source: detectSource(),
  };

  return cachedContext;
}
