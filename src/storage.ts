import type { PersistedState } from "./types";

const STORAGE_KEY = "__moderok__";
const IDENTITY_KEY = "__moderok_identity__";

let memoryState: PersistedState = {};

export interface StoredIdentity {
  userId?: string;
  lastPingDate?: string;
}

function hasStorageArea(): boolean {
  return typeof chrome !== "undefined" && !!chrome.storage?.local;
}

function hasSyncArea(): boolean {
  return typeof chrome !== "undefined" && !!chrome.storage?.sync;
}

export async function loadState(): Promise<PersistedState> {
  if (!hasStorageArea()) return memoryState;

  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      if (chrome.runtime?.lastError) {
        resolve(memoryState);
        return;
      }

      const raw = result?.[STORAGE_KEY];
      memoryState = raw && typeof raw === "object" ? (raw as PersistedState) : {};
      resolve(memoryState);
    });
  });
}

export async function saveState(state: PersistedState): Promise<void> {
  memoryState = state;

  if (!hasStorageArea()) return;

  await new Promise<void>((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: state }, () => {
      if (chrome.runtime?.lastError) {
        resolve();
        return;
      }
      resolve();
    });
  });
}

// chrome.storage.sync persists across ephemeral Chromebook profile wipes when
// Chrome Sync is enabled. We store only the identity subset (userId,
// lastPingDate) because sync is quota-limited (100KB total, 8KB per item) and
// rate-limited (120 writes/min). Full PersistedState stays in local.
export async function loadIdentityFromSync(): Promise<StoredIdentity> {
  if (!hasSyncArea()) return {};

  return new Promise((resolve) => {
    chrome.storage.sync.get(IDENTITY_KEY, (result) => {
      if (chrome.runtime?.lastError) {
        resolve({});
        return;
      }

      const raw = result?.[IDENTITY_KEY];
      if (!raw || typeof raw !== "object") {
        resolve({});
        return;
      }

      const userId = typeof (raw as StoredIdentity).userId === "string" ? (raw as StoredIdentity).userId : undefined;
      const lastPingDate =
        typeof (raw as StoredIdentity).lastPingDate === "string" ? (raw as StoredIdentity).lastPingDate : undefined;
      resolve({ userId, lastPingDate });
    });
  });
}

export async function saveIdentityToSync(identity: StoredIdentity): Promise<void> {
  if (!hasSyncArea()) return;

  const payload: StoredIdentity = {};
  if (identity.userId) payload.userId = identity.userId;
  if (identity.lastPingDate) payload.lastPingDate = identity.lastPingDate;

  await new Promise<void>((resolve) => {
    chrome.storage.sync.set({ [IDENTITY_KEY]: payload }, () => {
      if (chrome.runtime?.lastError) {
        resolve();
        return;
      }
      resolve();
    });
  });
}

