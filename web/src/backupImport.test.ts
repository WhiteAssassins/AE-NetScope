import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadJson } from "./backupImport";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("downloadJson", () => {
  it("clicks a link attached to the document and revokes its URL afterwards", () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => "blob:backup");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
    let attachedWhenClicked = false;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      attachedWhenClicked = document.body.contains(this);
    });

    downloadJson("backup.json", { devices: [] });

    expect(attachedWhenClicked).toBe(true);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:backup");
    expect(document.querySelector('a[download="backup.json"]')).toBeNull();
  });
});
