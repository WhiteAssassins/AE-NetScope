import { afterEach, describe, expect, it, vi } from "vitest";
import { formatDateTime, readRegionalPreferences, storeRegionalPreferences } from "./dateTime";

describe("regional date and time preferences", () => {
  afterEach(() => window.localStorage.clear());

  it("stores validated preferences and applies the selected timezone and clock", () => {
    expect(
      storeRegionalPreferences({ timezone: "UTC", date_format: "ymd", hour_format: "24" }),
    ).toBe(true);
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

  it("continues with defaults when regional storage is blocked", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    expect(readRegionalPreferences()).toEqual({
      timezone: "UTC",
      date_format: "locale",
      hour_format: "24",
    });
    getItem.mockRestore();

    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    expect(
      storeRegionalPreferences({ timezone: "UTC", date_format: "ymd", hour_format: "24" }),
    ).toBe(false);
    setItem.mockRestore();
  });

  it("keeps working with a time zone the browser rejects or a value that is not a date", () => {
    storeRegionalPreferences({ timezone: "Factory", date_format: "ymd", hour_format: "24" });

    expect(formatDateTime("2026-07-20T18:30:00Z", "en")).toBe("2026/07/20, 18:30:00");
    expect(formatDateTime("not a date", "en")).toBe("not a date");
  });
});
