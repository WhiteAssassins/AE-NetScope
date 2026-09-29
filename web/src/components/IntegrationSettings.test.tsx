import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import IntegrationSettings from "./IntegrationSettings";

function response(body: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("IntegrationSettings", () => {
  it("creates a write token, shows it once, and revokes it with CSRF", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response({
        id: 1, name: "Inventory client", allow_write: true,
        created_at: "2026-09-29T00:00:00Z", expires_at: "2026-10-29T00:00:00Z",
        revoked_at: null, token: "test-access-token",
      }, 201)).mockResolvedValueOnce(response(null, 204))
      .mockResolvedValueOnce(response([{
        id: 1, name: "Inventory client", allow_write: true,
        expires_at: "2026-10-29T00:00:00Z", revoked_at: "2026-09-29T00:00:00Z",
      }]));
    vi.stubGlobal("fetch", fetchMock);
    render(<IntegrationSettings csrfToken="csrf-value" canWrite />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await user.type(screen.getByLabelText("Token name"), "Inventory client");
    await user.type(screen.getByLabelText("Current password"), "test-password");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Create token" }));
    expect(await screen.findByDisplayValue("test-access-token")).toBeInTheDocument();
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    const options = fetchMock.mock.calls[1][1];
    expect(options.headers["X-CSRF-Token"]).toBe("csrf-value");
    expect(JSON.parse(options.body)).toMatchObject({ allow_write: true, expires_in_days: 30 });
    await user.click(screen.getByRole("button", { name: "Hide token" }));
    expect(screen.queryByDisplayValue("test-access-token")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Revoke" }));
    expect(await screen.findByText("Revoked")).toBeInTheDocument();
    expect(fetchMock.mock.calls[2][1].method).toBe("DELETE");
    expect(fetchMock.mock.calls[2][1].headers["X-CSRF-Token"]).toBe("csrf-value");
  });

  it("limits a viewer to read access and clears the password after failure", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response({ detail: "Permission denied" }, 403)));
    render(<IntegrationSettings csrfToken="csrf-value" canWrite={false} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Token name"), "Read access");
    await user.type(screen.getByLabelText("Current password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Create token" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByLabelText("Current password")).toHaveValue("");
  });
});
