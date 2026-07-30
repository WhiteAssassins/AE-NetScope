import { beforeEach, describe, expect, it } from "vitest";
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
    writeLocalSettings(settings);
    expect(JSON.parse(window.localStorage.getItem(LOCAL_SETTINGS_STORAGE_KEY) ?? "{}")).toEqual(
      settings,
    );
  });
});
