import { describe, it, expect } from "vitest";
import { buildUninstallUrl, normalizeConfig } from "../index";

function makeConfig(overrides: Record<string, unknown> = {}) {
  return normalizeConfig({
    appKey: "mk_test_key_12345",
    trackUninstalls: true,
    ...overrides,
  });
}

describe("buildUninstallUrl", () => {
  it("builds the correct URL from the default endpoint", () => {
    const config = makeConfig();
    const url = buildUninstallUrl(config, "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d");

    expect(url).not.toBeNull();
    const parsed = new URL(url!);
    expect(parsed.origin).toBe("https://api.moderok.dev");
    expect(parsed.pathname).toBe("/v1/uninstall");
    expect(parsed.searchParams.get("app")).toBe("mk_test_key_12345");
    expect(parsed.searchParams.get("uid")).toBe("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d");
  });

  it("includes redirect param when uninstallUrl is set", () => {
    const config = makeConfig({ uninstallUrl: "https://myext.com/bye" });
    const url = buildUninstallUrl(config, "test-uid");

    const parsed = new URL(url!);
    expect(parsed.searchParams.get("redirect")).toBe("https://myext.com/bye");
  });

  it("omits redirect param when uninstallUrl is not set", () => {
    const config = makeConfig();
    const url = buildUninstallUrl(config, "test-uid");

    const parsed = new URL(url!);
    expect(parsed.searchParams.has("redirect")).toBe(false);
  });

  it("returns null for an invalid endpoint", () => {
    const config = { ...makeConfig(), endpoint: "not-a-url" };
    const url = buildUninstallUrl(config, "test-uid");
    expect(url).toBeNull();
  });

  it("works with a custom endpoint", () => {
    const config = makeConfig({ endpoint: "https://custom.example.com/api/v2/events" });
    const url = buildUninstallUrl(config, "test-uid");

    const parsed = new URL(url!);
    expect(parsed.origin).toBe("https://custom.example.com");
    expect(parsed.pathname).toBe("/api/v2/uninstall");
  });
});
