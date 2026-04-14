type InstalledDetails = chrome.runtime.InstalledDetails;

let registered = false;

export function registerOnInstalled(handler: (details: InstalledDetails) => void): boolean {
  if (registered) return false;
  if (typeof chrome === "undefined" || !chrome.runtime?.onInstalled) return false;

  chrome.runtime.onInstalled.addListener(handler);
  registered = true;
  return true;
}
