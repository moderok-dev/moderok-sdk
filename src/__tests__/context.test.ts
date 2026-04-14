import { describe, it, expect } from "vitest";
import { parseBrowser, parseOs } from "../context";

const UA = {
  chromeWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  chromeMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  chromeLinux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  chromeAndroid: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  chromeCrOS: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  firefoxMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0",
  firefoxWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
  firefoxLinux: "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
  edgeWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
  edgeMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
  operaMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 OPR/115.0.0.0",
  braveLinux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Brave/131",
  vivaldiWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Vivaldi/7.0.3495.27",
} as const;

describe("parseBrowser", () => {
  it("detects Chrome from real Windows UA", () => {
    const result = parseBrowser(UA.chromeWin);
    expect(result.browser).toBe("chrome");
    expect(result.browserVersion).toBe("131.0.0.0");
  });

  it("detects Chrome from real macOS UA", () => {
    const result = parseBrowser(UA.chromeMac);
    expect(result.browser).toBe("chrome");
    expect(result.browserVersion).toBe("131.0.0.0");
  });

  it("detects Chrome from real Linux UA", () => {
    const result = parseBrowser(UA.chromeLinux);
    expect(result.browser).toBe("chrome");
    expect(result.browserVersion).toBe("131.0.0.0");
  });

  it("detects Firefox from real macOS UA", () => {
    const result = parseBrowser(UA.firefoxMac);
    expect(result.browser).toBe("firefox");
    expect(result.browserVersion).toBe("133.0");
  });

  it("detects Firefox from real Windows UA", () => {
    const result = parseBrowser(UA.firefoxWin);
    expect(result.browser).toBe("firefox");
    expect(result.browserVersion).toBe("133.0");
  });

  it("detects Firefox from real Linux UA", () => {
    const result = parseBrowser(UA.firefoxLinux);
    expect(result.browser).toBe("firefox");
    expect(result.browserVersion).toBe("133.0");
  });

  it("detects Edge from real Windows UA", () => {
    const result = parseBrowser(UA.edgeWin);
    expect(result.browser).toBe("edge");
    expect(result.browserVersion).toBe("131.0.0.0");
  });

  it("detects Edge from real macOS UA", () => {
    const result = parseBrowser(UA.edgeMac);
    expect(result.browser).toBe("edge");
    expect(result.browserVersion).toBe("131.0.0.0");
  });

  it("detects Opera as other_chromium from real macOS UA", () => {
    const result = parseBrowser(UA.operaMac);
    expect(result.browser).toBe("other_chromium");
    expect(result.browserVersion).toBe("129.0.0.0");
  });

  it("detects Brave as other_chromium from real Linux UA", () => {
    const result = parseBrowser(UA.braveLinux);
    expect(result.browser).toBe("other_chromium");
    expect(result.browserVersion).toBe("131.0.0.0");
  });

  it("detects Vivaldi as other_chromium from real Windows UA", () => {
    const result = parseBrowser(UA.vivaldiWin);
    expect(result.browser).toBe("other_chromium");
    expect(result.browserVersion).toBe("130.0.0.0");
  });

  it('returns "unknown" for an empty user agent', () => {
    const result = parseBrowser("");
    expect(result.browser).toBe("unknown");
    expect(result.browserVersion).toBe("unknown");
  });
});

describe("parseOs", () => {
  it("detects Windows from real Chrome UA", () => {
    expect(parseOs("Win32", UA.chromeWin)).toBe("Windows");
  });

  it("detects MacOS from real Chrome UA", () => {
    expect(parseOs("MacIntel", UA.chromeMac)).toBe("MacOS");
  });

  it("detects Linux from real Chrome UA", () => {
    expect(parseOs("Linux x86_64", UA.chromeLinux)).toBe("Linux");
  });

  it("detects Android from real Chrome mobile UA", () => {
    expect(parseOs("Linux armv8l", UA.chromeAndroid)).toBe("Android");
  });

  it("detects ChromeOS from real CrOS UA", () => {
    expect(parseOs("", UA.chromeCrOS)).toBe("ChromeOS");
  });

  it("detects MacOS from real Firefox UA", () => {
    expect(parseOs("MacIntel", UA.firefoxMac)).toBe("MacOS");
  });

  it("detects Windows from real Firefox UA", () => {
    expect(parseOs("Win32", UA.firefoxWin)).toBe("Windows");
  });

  it("detects Linux from real Firefox UA", () => {
    expect(parseOs("Linux x86_64", UA.firefoxLinux)).toBe("Linux");
  });

  it("detects Windows from platform alone when UA is empty", () => {
    expect(parseOs("Win32", "")).toBe("Windows");
  });

  it("detects MacOS from platform alone when UA is empty", () => {
    expect(parseOs("MacIntel", "")).toBe("MacOS");
  });

  it('returns "unknown" for empty platform and UA', () => {
    expect(parseOs("", "")).toBe("unknown");
  });
});
