import { afterEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, fetchInventoryData } from "./api";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("api client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches every inventory resource with credentials", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith("/dashboard")) return Promise.resolve(jsonResponse({ stats: {} }));
      if (url.endsWith("/devices")) return Promise.resolve(jsonResponse([{ id: 1, name: "SW" }]));
      if (url.endsWith("/networks")) return Promise.resolve(jsonResponse([{ id: 2 }]));
      if (url.endsWith("/vlans")) return Promise.resolve(jsonResponse([{ id: 3 }]));
      if (url.endsWith("/services")) return Promise.resolve(jsonResponse([{ id: 4 }]));
      if (url.endsWith("/ip-addresses")) return Promise.resolve(jsonResponse([{ id: 5 }]));
      if (url.endsWith("/interfaces")) return Promise.resolve(jsonResponse([{ id: 6 }]));
      return Promise.resolve(jsonResponse({}, 404));
    });
    vi.stubGlobal("fetch", fetchMock);

    const data = await fetchInventoryData();

    expect(data.dashboard).toEqual({ stats: {} });
    expect(data.devices).toEqual([{ id: 1, name: "SW" }]);
    expect(data.networks).toEqual([{ id: 2 }]);
    expect(data.vlans).toEqual([{ id: 3 }]);
    expect(data.services).toEqual([{ id: 4 }]);
    expect(data.ipMacs).toEqual([{ id: 5 }]);
    expect(data.interfaces).toEqual([{ id: 6 }]);
    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/inventory/dashboard`, {
      credentials: "include",
    });
  });

  it("throws unauthorized when the session is invalid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.endsWith("/dashboard")) return Promise.resolve(jsonResponse({}, 401));
        return Promise.resolve(jsonResponse([]));
      }),
    );

    await expect(fetchInventoryData()).rejects.toThrow("unauthorized");
  });

  it("returns empty lists when optional inventory resources fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.endsWith("/dashboard")) return Promise.resolve(jsonResponse({ stats: {} }));
        if (url.endsWith("/devices")) return Promise.resolve(jsonResponse([]));
        return Promise.resolve(jsonResponse({ error: "fail" }, 500));
      }),
    );

    const data = await fetchInventoryData();

    expect(data.devices).toEqual([]);
    expect(data.networks).toEqual([]);
    expect(data.vlans).toEqual([]);
    expect(data.services).toEqual([]);
    expect(data.ipMacs).toEqual([]);
    expect(data.interfaces).toEqual([]);
  });
});
