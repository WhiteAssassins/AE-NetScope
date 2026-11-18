import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import AuditView from "./AuditView";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const events = [
  {
    id: 1,
    actor_user_id: 1,
    actor_username: "admin",
    actor_email: "admin@example.com",
    event_type: "settings.maintenance_updated",
    message: "Maintenance mode enabled",
    ip_address: null,
    created_at: "2026-07-01T12:00:00Z",
  },
  {
    id: 2,
    actor_user_id: 1,
    actor_username: "admin",
    actor_email: "admin@example.com",
    event_type: "integration.token_created",
    message: "Integration token created",
    ip_address: null,
    created_at: "2026-07-01T12:01:00Z",
  },
  {
    id: 3,
    actor_user_id: 1,
    actor_username: "admin",
    actor_email: "admin@example.com",
    event_type: "auth.logout",
    message: "Logout succeeded for admin@example.com",
    ip_address: "10.0.0.5",
    created_at: "2026-07-01T12:02:00Z",
  },
];

describe("AuditView", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("filters settings and integration events by group", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(events))));

    render(<AuditView permissions={["audit:read"]} />);
    expect(await screen.findByText("Maintenance mode: Enabled")).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox"), "settings");
    expect(screen.getByText("Maintenance mode: Enabled")).toBeInTheDocument();
    expect(screen.queryByText("Integration token created")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox"), "integration");
    expect(screen.getByText("Integration token created")).toBeInTheDocument();
    expect(screen.queryByText("Maintenance mode: Enabled")).not.toBeInTheDocument();
  });

  it("stops loading and explains a failed load or refresh", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse(events))
      .mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);

    render(<AuditView permissions={["audit:read"]} />);
    expect(await screen.findByText("The change history could not be loaded.")).toBeInTheDocument();
    expect(screen.queryByText("Loading history...")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /refresh/i }));
    expect(await screen.findByText("Maintenance mode: Enabled")).toBeInTheDocument();
    expect(screen.queryByText("The change history could not be loaded.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /refresh/i }));
    expect(await screen.findByText("The change history could not be loaded.")).toBeInTheDocument();
    expect(screen.queryByText("Loading history...")).not.toBeInTheDocument();
  });

  it("explains that the audit log needs permission", () => {
    render(<AuditView permissions={["inventory:read"]} />);

    expect(screen.getByText("You do not have permission to view the audit history.")).toBeInTheDocument();
    expect(screen.queryByText("Loading history...")).not.toBeInTheDocument();
  });

  it("searches and groups older events through the API", async () => {
    const user = userEvent.setup();
    const older = { ...events[0], id: 90, message: "Maintenance mode disabled", created_at: "2025-01-01T00:00:00Z" };
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(jsonResponse(url.includes("q=") ? [older] : events)),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<AuditView permissions={["audit:read"]} />);
    await screen.findByText("Maintenance mode: Enabled");

    await user.selectOptions(screen.getByRole("combobox"), "settings");
    await user.type(screen.getByPlaceholderText(/search/i), "disabled");

    expect(await screen.findByText("Maintenance mode: Disabled")).toBeInTheDocument();
    const requested = fetchMock.mock.calls.map(([url]) => url);
    expect(requested.some((url) => url.includes("group=settings") && url.includes("q=disabled"))).toBe(true);
  });
});
