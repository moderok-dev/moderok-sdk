import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ChromeStorageArea = {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
};

type ChromeStub = {
  storage: {
    local?: ChromeStorageArea;
    sync?: ChromeStorageArea;
  };
  runtime: { lastError?: { message: string } };
};

const originalChrome = (globalThis as { chrome?: unknown }).chrome;

function makeArea(backing: Record<string, unknown>): ChromeStorageArea {
  return {
    get: vi.fn((key: string, cb: (result: Record<string, unknown>) => void) => {
      cb(key in backing ? { [key]: backing[key] } : {});
    }),
    set: vi.fn((items: Record<string, unknown>, cb?: () => void) => {
      Object.assign(backing, items);
      cb?.();
    }),
  };
}

function installChrome(stub: ChromeStub): void {
  (globalThis as { chrome?: unknown }).chrome = stub;
}

function uninstallChrome(): void {
  if (originalChrome === undefined) {
    delete (globalThis as { chrome?: unknown }).chrome;
  } else {
    (globalThis as { chrome?: unknown }).chrome = originalChrome;
  }
}

async function importFresh() {
  vi.resetModules();
  return import("../storage");
}

afterEach(() => {
  uninstallChrome();
  vi.restoreAllMocks();
});

describe("loadIdentityFromSync", () => {
  it("returns {} when chrome.storage.sync is unavailable", async () => {
    installChrome({ storage: { local: makeArea({}) }, runtime: {} });
    const { loadIdentityFromSync } = await importFresh();

    expect(await loadIdentityFromSync()).toEqual({});
  });

  it("returns {} when chrome is undefined entirely", async () => {
    uninstallChrome();
    const { loadIdentityFromSync } = await importFresh();

    expect(await loadIdentityFromSync()).toEqual({});
  });

  it("returns {} when chrome.runtime.lastError is set", async () => {
    const syncBacking: Record<string, unknown> = {
      __moderok_identity__: { userId: "should-not-be-returned" },
    };
    const stub: ChromeStub = {
      storage: { local: makeArea({}), sync: makeArea(syncBacking) },
      runtime: { lastError: { message: "quota exceeded" } },
    };
    installChrome(stub);
    const { loadIdentityFromSync } = await importFresh();

    expect(await loadIdentityFromSync()).toEqual({});
  });

  it("returns the stored userId and lastPingDate on the happy path", async () => {
    const syncBacking: Record<string, unknown> = {
      __moderok_identity__: {
        userId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        lastPingDate: "2026-04-12",
      },
    };
    installChrome({
      storage: { local: makeArea({}), sync: makeArea(syncBacking) },
      runtime: {},
    });
    const { loadIdentityFromSync } = await importFresh();

    expect(await loadIdentityFromSync()).toEqual({
      userId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      lastPingDate: "2026-04-12",
    });
  });

  it("ignores non-string fields in the stored payload", async () => {
    const syncBacking: Record<string, unknown> = {
      __moderok_identity__: { userId: 42, lastPingDate: null },
    };
    installChrome({
      storage: { local: makeArea({}), sync: makeArea(syncBacking) },
      runtime: {},
    });
    const { loadIdentityFromSync } = await importFresh();

    expect(await loadIdentityFromSync()).toEqual({});
  });
});

describe("saveIdentityToSync", () => {
  it("no-ops silently when chrome.storage.sync is unavailable", async () => {
    installChrome({ storage: { local: makeArea({}) }, runtime: {} });
    const { saveIdentityToSync } = await importFresh();

    await expect(
      saveIdentityToSync({ userId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d" }),
    ).resolves.toBeUndefined();
  });

  it("writes only userId and lastPingDate, not other fields", async () => {
    const syncBacking: Record<string, unknown> = {};
    const syncArea = makeArea(syncBacking);
    installChrome({
      storage: { local: makeArea({}), sync: syncArea },
      runtime: {},
    });
    const { saveIdentityToSync } = await importFresh();

    await saveIdentityToSync({
      userId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      lastPingDate: "2026-04-12",
    });

    expect(syncArea.set).toHaveBeenCalledTimes(1);
    const [payload] = syncArea.set.mock.calls[0];
    expect(payload).toEqual({
      __moderok_identity__: {
        userId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        lastPingDate: "2026-04-12",
      },
    });
  });

  it("omits undefined fields from the stored payload", async () => {
    const syncBacking: Record<string, unknown> = {};
    const syncArea = makeArea(syncBacking);
    installChrome({
      storage: { local: makeArea({}), sync: syncArea },
      runtime: {},
    });
    const { saveIdentityToSync } = await importFresh();

    await saveIdentityToSync({ userId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d" });

    expect(syncArea.set.mock.calls[0][0]).toEqual({
      __moderok_identity__: { userId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d" },
    });
  });

  it("swallows chrome.runtime.lastError without throwing", async () => {
    const syncArea = makeArea({});
    installChrome({
      storage: { local: makeArea({}), sync: syncArea },
      runtime: { lastError: { message: "quota exceeded" } },
    });
    const { saveIdentityToSync } = await importFresh();

    await expect(
      saveIdentityToSync({ userId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d" }),
    ).resolves.toBeUndefined();
  });
});

describe("loadState / saveState (existing behavior unchanged)", () => {
  beforeEach(() => {
    // Ensure no sync stub leaks from sibling tests.
    uninstallChrome();
  });

  it("round-trips through chrome.storage.local", async () => {
    const localBacking: Record<string, unknown> = {};
    installChrome({
      storage: { local: makeArea(localBacking) },
      runtime: {},
    });
    const { loadState, saveState } = await importFresh();

    await saveState({ userId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", lastPingDate: "2026-04-12" });
    const loaded = await loadState();

    expect(loaded.userId).toBe("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d");
    expect(loaded.lastPingDate).toBe("2026-04-12");
  });
});
