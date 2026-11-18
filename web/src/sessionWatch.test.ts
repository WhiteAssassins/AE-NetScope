import { afterEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL } from "./api";
import { watchForEndedSession } from "./sessionWatch";

describe("watchForEndedSession", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports a 401 from the API except for credential checks", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(null, { status: 401 }))));
    const onEnded = vi.fn();
    const stop = watchForEndedSession(onEnded);

    await window.fetch(`${API_BASE_URL}/auth/login`);
    await window.fetch(`${API_BASE_URL}/security/passkeys/authenticate/verify`);
    await window.fetch("https://example.com/other");
    expect(onEnded).not.toHaveBeenCalled();

    await window.fetch(`${API_BASE_URL}/inventory/devices`);
    expect(onEnded).toHaveBeenCalledTimes(1);

    stop();
    await window.fetch(`${API_BASE_URL}/inventory/devices`);
    expect(onEnded).toHaveBeenCalledTimes(1);
  });
});
