import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminSettings from "./AdminSettings";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
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
    await waitFor(() => expect(toggle).toBeEnabled());
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

  it("keeps successful administrative sections usable when another endpoint fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/security/maintenance")) {
          return Promise.resolve(jsonResponse({ enabled: true, message: "Planned work" }));
        }
        if (url.endsWith("/security/search-indexing")) {
          return Promise.resolve(jsonResponse({}, 503));
        }
        return Promise.resolve(
          jsonResponse([
            {
              id: 1,
              requested_by_user_id: 1,
              requested_by: "admin@example.com",
              target_tag: "v0.1.8-alpha",
              status: "succeeded",
              message: null,
              created_at: "2026-07-01T12:00:00Z",
            },
          ]),
        );
      }),
    );

    render(<AdminSettings csrfToken="csrf-token" />);

    const maintenanceToggle = await screen.findByRole("checkbox", {
      name: /maintenance mode/i,
    });
    expect(maintenanceToggle).toBeChecked();
    expect(maintenanceToggle).toBeEnabled();
    expect(screen.getByDisplayValue("Planned work")).toBeEnabled();
    expect(screen.getByText("v0.1.8-alpha")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /block search engine indexing/i }),
    ).toBeDisabled();
    expect(screen.getByText(/administrative settings could not be loaded/i)).toBeInTheDocument();
  });
});
