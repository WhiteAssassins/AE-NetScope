import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedUser, User } from "../types";
import UsersView from "./UsersView";

const currentUser: User = {
  id: 1,
  email: "admin@example.com",
  username: "admin",
  role: "admin",
  permissions: ["users:manage"],
  must_change_password: false,
  preferred_language: "en",
};

const managedUsers: ManagedUser[] = [
  {
    id: 1,
    email: "admin@example.com",
    username: "admin",
    role: "admin",
    is_active: true,
    must_change_password: false,
    locked_until: null,
    last_login_at: "2026-07-20T12:00:00Z",
    created_at: "2026-06-01T12:00:00Z",
    active_session_count: 1,
    totp_enabled: true,
    passkey_count: 1,
  },
  {
    id: 2,
    email: "viewer@example.com",
    username: "viewer",
    role: "viewer",
    is_active: false,
    must_change_password: true,
    locked_until: null,
    last_login_at: null,
    created_at: "2026-07-01T12:00:00Z",
    active_session_count: 0,
    totp_enabled: false,
    passkey_count: 0,
  },
];

const sessions = [
  {
    id: 11,
    user_id: 1,
    user_agent: "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0",
    ip_address: "10.0.0.12",
    created_at: "2026-07-20T12:00:00Z",
    expires_at: "2099-07-20T12:00:00Z",
    revoked_at: null,
    is_current: true,
  },
];

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requestUrl(input: string | URL | Request) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

describe("UsersView", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) => {
        const url = requestUrl(input);
        if (url.includes("/sessions")) return Promise.resolve(jsonResponse(sessions));
        return Promise.resolve(jsonResponse(managedUsers));
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows operational summaries, security state, and working filters", async () => {
    const user = userEvent.setup();
    render(
      <UsersView
        csrfToken="csrf"
        currentUser={currentUser}
        onCurrentUserChanged={vi.fn()}
      />,
    );

    expect(await screen.findByText("Total accounts")).toBeInTheDocument();
    expect(screen.getByText("MFA protected")).toBeInTheDocument();
    expect(screen.getByText("TOTP · 1 passkey")).toBeInTheDocument();
    expect(screen.getByText("Your account")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Status"), "inactive");
    expect(screen.getByText("viewer@example.com")).toBeInTheDocument();
    expect(screen.queryByText("admin@example.com")).not.toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText(/search by email/i));
    await user.type(screen.getByPlaceholderText(/search by email/i), "nobody");
    expect(screen.getByText("No users match these filters")).toBeInTheDocument();
  });

  it("edits a managed account through the dedicated panel", async () => {
    const user = userEvent.setup();
    let patchedBody: Record<string, unknown> | null = null;
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.endsWith("/users/2/sessions")) return Promise.resolve(jsonResponse([]));
      if (url.endsWith("/users/2") && init?.method === "PATCH") {
        patchedBody = JSON.parse(String(init.body)) as Record<string, unknown>;
        return Promise.resolve(
          jsonResponse({ ...managedUsers[1], ...patchedBody, is_active: true }),
        );
      }
      return Promise.resolve(
        jsonResponse(
          patchedBody
            ? [{ ...managedUsers[0] }, { ...managedUsers[1], ...patchedBody, is_active: true }]
            : managedUsers,
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <UsersView
        csrfToken="csrf-token"
        currentUser={currentUser}
        onCurrentUserChanged={vi.fn()}
      />,
    );

    const viewerRow = (await screen.findByText("viewer@example.com")).closest("tr");
    expect(viewerRow).not.toBeNull();
    await user.click(within(viewerRow!).getByRole("button", { name: "Manage" }));
    const managementPanel = screen.getByRole("heading", { name: "viewer" }).closest("aside");
    expect(managementPanel).not.toBeNull();
    await user.clear(within(managementPanel!).getByLabelText("Email"));
    await user.type(within(managementPanel!).getByLabelText("Email"), "operator@example.com");
    await user.clear(within(managementPanel!).getByLabelText("Username"));
    await user.type(within(managementPanel!).getByLabelText("Username"), "operator");
    await user.selectOptions(within(managementPanel!).getByLabelText("Role"), "operator");
    await user.click(within(managementPanel!).getByLabelText(/Active account/i));
    await user.click(within(managementPanel!).getByRole("button", { name: "Save" }));

    expect(patchedBody).toEqual(
      expect.objectContaining({
        email: "operator@example.com",
        username: "operator",
        role: "operator",
        is_active: true,
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/users/2"),
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({ "X-CSRF-Token": "csrf-token" }),
      }),
    );
  });

  it("creates an account and exposes its temporary password once", async () => {
    const user = userEvent.setup();
    const createdUser = {
      ...managedUsers[1],
      id: 3,
      email: "new@example.com",
      username: "new-user",
      is_active: true,
    };
    let created = false;
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const url = requestUrl(input);
        if (url.endsWith("/users") && init?.method === "POST") {
          created = true;
          return Promise.resolve(
            jsonResponse({ user: createdUser, temporary_password: "Temporary-Password-123" }, 201),
          );
        }
        if (url.includes("/users/3/sessions")) return Promise.resolve(jsonResponse([]));
        return Promise.resolve(jsonResponse(created ? [...managedUsers, createdUser] : managedUsers));
      }),
    );

    render(
      <UsersView
        csrfToken="csrf"
        currentUser={currentUser}
        onCurrentUserChanged={vi.fn()}
      />,
    );
    await user.click(await screen.findByRole("button", { name: "New user" }));
    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.type(screen.getByLabelText("Username"), "new-user");
    await user.click(screen.getByRole("button", { name: "Create user" }));

    expect(await screen.findByText("Temporary-Password-123")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy password" }));
    expect(writeText).toHaveBeenCalledWith("Temporary-Password-123");
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("protects the current administrator role and account status", async () => {
    const user = userEvent.setup();
    render(
      <UsersView
        csrfToken="csrf"
        currentUser={currentUser}
        onCurrentUserChanged={vi.fn()}
      />,
    );

    const adminRow = (await screen.findByText("admin@example.com")).closest("tr");
    await user.click(within(adminRow!).getByRole("button", { name: "Manage" }));

    const managementPanel = screen.getByRole("heading", { name: "admin" }).closest("aside");
    expect(within(managementPanel!).getByLabelText("Role")).toBeDisabled();
    expect(within(managementPanel!).getByLabelText(/Active account/i)).toBeDisabled();
    expect(screen.getByText(/use another administrator/i)).toBeInTheDocument();
  });

  it("keeps only sessions from the latest selected user", async () => {
    const user = userEvent.setup();
    const pendingSessions = new Map<number, (response: Response) => void>();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) => {
        const url = requestUrl(input);
        const match = url.match(/\/users\/(\d+)\/sessions$/);
        if (match) {
          return new Promise<Response>((resolve) => {
            pendingSessions.set(Number(match[1]), resolve);
          });
        }
        return Promise.resolve(jsonResponse(managedUsers));
      }),
    );

    render(
      <UsersView
        csrfToken="csrf"
        currentUser={currentUser}
        onCurrentUserChanged={vi.fn()}
      />,
    );

    const adminRow = (await screen.findByText("admin@example.com")).closest("tr");
    const viewerRow = screen.getByText("viewer@example.com").closest("tr");
    await user.click(within(adminRow!).getByRole("button", { name: "Manage" }));
    await user.click(within(viewerRow!).getByRole("button", { name: "Manage" }));

    pendingSessions.get(2)?.(
      jsonResponse([{ ...sessions[0], id: 22, user_id: 2, ip_address: "10.0.0.22" }]),
    );
    expect(await screen.findByText("10.0.0.22")).toBeInTheDocument();

    pendingSessions.get(1)?.(jsonResponse(sessions));
    await Promise.resolve();
    expect(screen.queryByText("10.0.0.12")).not.toBeInTheDocument();
    expect(screen.getByText("10.0.0.22")).toBeInTheDocument();
  });

  it("updates the authenticated user after editing the current account", async () => {
    const user = userEvent.setup();
    const onCurrentUserChanged = vi.fn();
    const updatedAdmin = {
      ...managedUsers[0],
      email: "owner@example.com",
      username: "owner",
    };
    let updated = false;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const url = requestUrl(input);
        if (url.endsWith("/users/1") && init?.method === "PATCH") {
          updated = true;
          return Promise.resolve(jsonResponse(updatedAdmin));
        }
        if (url.endsWith("/users/1/sessions")) return Promise.resolve(jsonResponse(sessions));
        return Promise.resolve(jsonResponse(updated ? [updatedAdmin, managedUsers[1]] : managedUsers));
      }),
    );

    render(
      <UsersView
        csrfToken="csrf"
        currentUser={currentUser}
        onCurrentUserChanged={onCurrentUserChanged}
      />,
    );

    const adminRow = (await screen.findByText("admin@example.com")).closest("tr");
    await user.click(within(adminRow!).getByRole("button", { name: "Manage" }));
    const managementPanel = screen.getByRole("heading", { name: "admin" }).closest("aside");
    await user.clear(within(managementPanel!).getByLabelText("Email"));
    await user.type(within(managementPanel!).getByLabelText("Email"), "owner@example.com");
    await user.clear(within(managementPanel!).getByLabelText("Username"));
    await user.type(within(managementPanel!).getByLabelText("Username"), "owner");
    await user.click(within(managementPanel!).getByRole("button", { name: "Save" }));

    expect(onCurrentUserChanged).toHaveBeenCalledWith(
      expect.objectContaining({ email: "owner@example.com", username: "owner" }),
    );
  });

  it("runs password, MFA, unlock, and session security actions", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const securedOperator: ManagedUser = {
      ...managedUsers[1],
      is_active: true,
      locked_until: "2099-07-01T12:00:00Z",
      active_session_count: 1,
      totp_enabled: true,
    };
    const operatorSession = {
      ...sessions[0],
      id: 22,
      user_id: 2,
      is_current: false,
      ip_address: "10.0.0.22",
    };
    let usersState = [managedUsers[0], securedOperator];
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.endsWith("/users/2/sessions/22") && init?.method === "DELETE") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (url.endsWith("/users/2/sessions") && init?.method === "DELETE") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (url.endsWith("/users/2/sessions")) {
        return Promise.resolve(jsonResponse([operatorSession]));
      }
      if (url.endsWith("/users/2/reset-password") && init?.method === "POST") {
        return Promise.resolve(
          jsonResponse({ user: securedOperator, temporary_password: "Reset-Password-123" }),
        );
      }
      if (url.endsWith("/users/2/reset-mfa") && init?.method === "POST") {
        return Promise.resolve(jsonResponse(securedOperator));
      }
      if (url.endsWith("/users/2") && init?.method === "PATCH") {
        const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
        usersState = [managedUsers[0], { ...securedOperator, ...payload }];
        return Promise.resolve(jsonResponse(usersState[1]));
      }
      return Promise.resolve(jsonResponse(usersState));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <UsersView
        csrfToken="csrf-token"
        currentUser={currentUser}
        onCurrentUserChanged={vi.fn()}
      />,
    );

    const operatorRow = (await screen.findByText("viewer@example.com")).closest("tr");
    await user.click(within(operatorRow!).getByRole("button", { name: "Manage" }));
    const panel = screen.getByRole("heading", { name: "viewer" }).closest("aside")!;

    await user.click(within(panel).getByRole("button", { name: "Unlock login" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/users/2"),
        expect.objectContaining({ body: JSON.stringify({ clear_lock: true }) }),
      ),
    );

    await user.click(within(panel).getByRole("button", { name: "Require password change" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/users/2"),
        expect.objectContaining({ body: JSON.stringify({ must_change_password: true }) }),
      ),
    );

    await user.click(within(panel).getByRole("button", { name: "Reset password" }));
    expect(await screen.findByText("Reset-Password-123")).toBeInTheDocument();

    await user.click(within(panel).getByRole("button", { name: "Reset MFA and passkeys" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/users/2/reset-mfa"),
        expect.objectContaining({ method: "POST" }),
      ),
    );

    await user.click(within(panel).getByRole("button", { name: "Close this session" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/users/2/sessions/22"),
        expect.objectContaining({ method: "DELETE" }),
      ),
    );

    await user.click(within(panel).getByRole("button", { name: "Close active sessions" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/users\/2\/sessions$/),
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    expect(confirm).toHaveBeenCalledTimes(4);
  });

  it("classifies browsers, platforms, and inactive sessions", async () => {
    const user = userEvent.setup();
    const sessionVariants = [
      { ...sessions[0], id: 21, is_current: false, user_agent: "Edg/130 Windows" },
      { ...sessions[0], id: 22, is_current: false, user_agent: "Firefox/130 Android" },
      { ...sessions[0], id: 23, is_current: false, user_agent: "Safari/18 Mac OS" },
      { ...sessions[0], id: 24, is_current: false, user_agent: "Custom Linux" },
      { ...sessions[0], id: 25, is_current: false, user_agent: "Unknown" },
      { ...sessions[0], id: 26, is_current: false, user_agent: null, revoked_at: "2026-01-01T00:00:00Z" },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) =>
        Promise.resolve(
          requestUrl(input).endsWith("/users/2/sessions")
            ? jsonResponse(sessionVariants)
            : jsonResponse(managedUsers),
        ),
      ),
    );

    render(
      <UsersView
        csrfToken="csrf"
        currentUser={currentUser}
        onCurrentUserChanged={vi.fn()}
      />,
    );
    const viewerRow = (await screen.findByText("viewer@example.com")).closest("tr");
    await user.click(within(viewerRow!).getByRole("button", { name: "Manage" }));

    expect(await screen.findByText(/Edge.*Windows/)).toBeInTheDocument();
    expect(screen.getByText(/Firefox.*Android/)).toBeInTheDocument();
    expect(screen.getByText(/Safari.*macOS/)).toBeInTheDocument();
    expect(screen.getByText(/Browser.*Linux/)).toBeInTheDocument();
    expect(screen.getByText(/Browser.*Unknown platform/)).toBeInTheDocument();
    expect(screen.getByText("Unknown client")).toBeInTheDocument();
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("keeps destructive account changes behind confirmation", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = requestUrl(input);
      if (url.endsWith("/users/2/sessions")) return Promise.resolve(jsonResponse([]));
      return Promise.resolve(jsonResponse(managedUsers));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <UsersView
        csrfToken="csrf"
        currentUser={currentUser}
        onCurrentUserChanged={vi.fn()}
      />,
    );
    const viewerRow = (await screen.findByText("viewer@example.com")).closest("tr");
    await user.click(within(viewerRow!).getByRole("button", { name: "Manage" }));
    const panel = screen.getByRole("heading", { name: "viewer" }).closest("aside")!;

    await user.click(within(panel).getByRole("button", { name: "Reset password" }));
    expect(confirm).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("reset-password"),
      expect.anything(),
    );
  });
});
