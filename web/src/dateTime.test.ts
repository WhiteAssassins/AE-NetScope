import { afterEach, describe, expect, it } from "vitest";
import { formatDateTime, readRegionalPreferences, storeRegionalPreferences } from "./dateTime";

describe("regional date and time preferences", () => {
  afterEach(() => window.localStorage.clear());

  it("stores validated preferences and applies the selected timezone and clock", () => {
    storeRegionalPreferences({ timezone: "UTC", date_format: "ymd", hour_format: "24" });
    expect(readRegionalPreferences()).toEqual({
      timezone: "UTC",
      date_format: "ymd",
      hour_format: "24",
    });
    expect(formatDateTime("2026-07-20T18:30:00Z", "en-CA")).toContain("18:30");
  });

  it("falls back when stored data is malformed", () => {
    window.localStorage.setItem("ae-netscope-regional-preferences", "not-json");
    expect(readRegionalPreferences()).toEqual({
      timezone: "UTC",
      date_format: "locale",
      hour_format: "24",
    });
  });
});
