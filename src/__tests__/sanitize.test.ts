import { describe, it, expect } from "vitest";
import { sanitizeProperties } from "../index";

describe("sanitizeProperties", () => {
  it("keeps string, number, and boolean values", () => {
    const result = sanitizeProperties({
      plan: "pro",
      tabs_open: 12,
      dark_mode: true,
    });

    expect(result).toEqual({
      plan: "pro",
      tabs_open: 12,
      dark_mode: true,
    });
  });

  it("drops objects, arrays, null, and undefined from mixed input", () => {
    const result = sanitizeProperties({
      url: "https://example.com",
      metadata: { nested: true },
      tags: ["a", "b"],
      count: 5,
      enabled: null,
      missing: undefined,
    });

    expect(result).toEqual({
      url: "https://example.com",
      count: 5,
    });
  });

  it("drops NaN and Infinity but keeps 0", () => {
    const result = sanitizeProperties({
      score: NaN,
      ratio: Infinity,
      negative_inf: -Infinity,
      zero: 0,
    });

    expect(result).toEqual({ zero: 0 });
  });

  it('keeps falsy-but-valid values: 0, "", false', () => {
    const result = sanitizeProperties({
      count: 0,
      label: "",
      active: false,
    });

    expect(result).toEqual({
      count: 0,
      label: "",
      active: false,
    });
  });

  it("returns undefined when all properties are invalid", () => {
    const result = sanitizeProperties({
      data: { nested: true },
      list: [1, 2, 3],
      nothing: null,
    });

    expect(result).toBeUndefined();
  });

  it("returns undefined when input is undefined", () => {
    expect(sanitizeProperties(undefined)).toBeUndefined();
  });

  it("returns undefined for an empty object", () => {
    expect(sanitizeProperties({})).toBeUndefined();
  });

  it("handles a realistic extension analytics payload", () => {
    const result = sanitizeProperties({
      action: "tab_switch",
      tab_count: 47,
      is_pinned: false,
      url: "https://github.com/pulls",
      timestamp: 1711929600000,
      user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    });

    expect(result).toEqual({
      action: "tab_switch",
      tab_count: 47,
      is_pinned: false,
      url: "https://github.com/pulls",
      timestamp: 1711929600000,
      user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    });
  });
});
