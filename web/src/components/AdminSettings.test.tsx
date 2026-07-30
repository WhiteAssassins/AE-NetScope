import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminSettings from "./AdminSettings";

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("AdminSettings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("blocks search indexing by default and persists an explicit opt-in", async () => {
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      const url = String(input);
      if (init?.method === "PATCH" && url.endsWith("/security/search-indexing")) {
        return Promise.resolve(jsonResponse({ allow_indexing: true }));
      }
      if (url.endsWith("/security/maintenance")) {
        return Promise.resolve(jsonResponse({ enabled: false, message: "Maintenance" }));
      }
      if (url.endsWith("/security/search-indexing")) {
        return Promise.resolve(jsonResponse({ allow_indexing: false }));
      }
      return Promise.resolve(jsonResponse([]));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<AdminSettings csrfToken="csrf-token" />);

    const toggle = await screen.findByRole("checkbox", {
      name: /block search engine indexing/i,
    });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    await user.click(screen.getAllByRole("button", { name: "Save" })[0]);

    await waitFor(() =>
      expect(screen.getByText("Search engine visibility saved.")).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/security/search-indexing"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ allow_indexing: true }),
      }),
    );
  });
});
