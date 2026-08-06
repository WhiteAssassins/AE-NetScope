import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultLocalSettings,
  LOCAL_SETTINGS_STORAGE_KEY,
  readLocalSettings,
  writeLocalSettings,
} from "./settings";

describe("local interface settings", () => {
  beforeEach(() => window.localStorage.clear());

  it("returns defaults when storage is missing or malformed", () => {
    expect(readLocalSettings()).toEqual(defaultLocalSettings);

    window.localStorage.setItem(LOCAL_SETTINGS_STORAGE_KEY, "not-json");
    expect(readLocalSettings()).toEqual(defaultLocalSettings);
  });

  it("migrates older stored settings and validates their values", () => {
    window.localStorage.setItem(
      LOCAL_SETTINGS_STORAGE_KEY,
      JSON.stringify({ compactTables: true, defaultView: "invalid", showPreviewNotice: false }),
    );

    expect(readLocalSettings()).toEqual({
      ...defaultLocalSettings,
      compactTables: true,
      defaultView: "dashboard",
      showPreviewNotice: false,
    });
  });

  it("writes complete settings", () => {
    const settings = { ...defaultLocalSettings, reducedMotion: true, showFooter: false };
    expect(writeLocalSettings(settings)).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(LOCAL_SETTINGS_STORAGE_KEY) ?? "{}")).toEqual(
      settings,
    );
  });

  it("uses defaults and reports writes that are blocked by the browser", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    expect(readLocalSettings()).toEqual(defaultLocalSettings);
    getItem.mockRestore();

    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    expect(writeLocalSettings(defaultLocalSettings)).toBe(false);
    setItem.mockRestore();
  });
});
