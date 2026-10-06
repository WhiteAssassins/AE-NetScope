import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type { AuditEvent, User } from "./types";

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  fetchInventoryData: vi.fn().mockResolvedValue({
    dashboard: null,
    devices: [],
    networks: [],
    vlans: [],
    services: [],
    ipMacs: [],
    interfaces: [],
    quality: null,
  }),
  fetchVersionInfo: vi.fn().mockResolvedValue(null),
  fetchMaintenanceStatus: vi.fn().mockResolvedValue({ enabled: false, message: "" }),
  fetchSearchIndexingPolicy: vi.fn().mockResolvedValue({ allow_indexing: false }),
  fetchHealthStatus: vi.fn().mockRejectedValue(new Error("unavailable")),
  fetchUpdateStatus: vi.fn().mockRejectedValue(new Error("unavailable")),
}));

vi.mock("./components/GitHubButton", () => ({ default: () => null }));
vi.mock("./components/TopbarSystemStatus", () => ({ default: () => null }));
vi.mock("./views/DashboardView", () => ({
  default: ({ auditEvents }: { auditEvents: AuditEvent[] }) => (
    <div data-testid="dashboard-activity">
      {auditEvents.map((event) => <span key={event.id}>{event.message}</span>)}
    </div>
  ),
}));
vi.mock("./views/SettingsView", () => ({
  default: ({ onUserChanged }: { onUserChanged: (user: User) => void }) => (
    <button onClick={() => onUserChanged({ ...viewer, id: admin.id })}>
      Demote current account
    </button>
  ),
}));

const admin: User = {
  id: 1,
  email: "admin@example.com",
  username: "admin",
  role: "admin",
  permissions: ["inventory:read", "users:manage", "audit:read"],
  must_change_password: false,
  preferred_language: "en",
};
const viewer: User = {
  ...admin,
  id: 2,
  email: "viewer@example.com",
  username: "viewer",
  role: "viewer",
  permissions: ["inventory:read"],
};
const event: AuditEvent = {
  id: 8,
  actor_user_id: 1,
  actor_username: "admin",
  actor_email: "admin@example.com",
  event_type: "custom.private_action",
  message: "Private audit action",
  ip_address: null,
  created_at: "2026-09-29T10:00:00Z",
};

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function mockAuthenticatedApi(
  auditResponse = () => Promise.resolve(jsonResponse([event])),
  usersResponse = () => Promise.resolve(jsonResponse([{ id: 7, email: "private.user@example.com", username: "private-user", role: "admin" }])),
) {
  let activeUser: User | null = admin;
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/auth/setup")) return Promise.resolve(jsonResponse({ setup_required: false, token_required: false }));
    if (url.endsWith("/auth/me")) return Promise.resolve(jsonResponse({ user: activeUser }));
    if (url.endsWith("/auth/csrf")) return Promise.resolve(jsonResponse({ csrf_token: "csrf" }));
    if (url.endsWith("/users")) return usersResponse();
    if (url.includes("/audit/events")) return auditResponse();
    if (url.endsWith("/integrations/tokens")) return Promise.resolve(jsonResponse([]));
    if (url.endsWith("/auth/logout")) {
      activeUser = null;
      return Promise.resolve(jsonResponse({}));
    }
    if (url.endsWith("/auth/login")) {
      activeUser = viewer;
      return Promise.resolve(jsonResponse({ user: viewer, csrf_token: "viewer-csrf" }));
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function signInAsViewer() {
  const browser = userEvent.setup();
  await browser.click(screen.getByRole("button", { name: "Sign out" }));
  await browser.type(await screen.findByLabelText("Email"), "viewer@example.com");
  await browser.type(screen.getByLabelText("Password"), "viewer-password");
  await browser.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByText("viewer");
  return browser;
}

describe("App navigation and account boundaries", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("opens MCP token management from the sidebar", async () => {
    const fetchMock = mockAuthenticatedApi();
    const browser = userEvent.setup();
    render(<App />);

    await screen.findByText("Private audit action");
    await browser.click(screen.getByRole("button", { name: "MCP" }));

    expect(await screen.findByRole("heading", { name: "MCP integrations" })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) =>
      String(url).endsWith("/integrations/tokens"))).toBe(true));
  });

  it("removes privileged users and audit data after switching to a viewer", async () => {
    const fetchMock = mockAuthenticatedApi();
    render(<App />);
    await screen.findByText("Private audit action");
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/users"))).toBe(true));

    const browser = await signInAsViewer();
    const search = screen.getByRole("searchbox");
    await browser.type(search, "private.user@example.com");
    expect(screen.queryByText("private.user@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("Private audit action")).not.toBeInTheDocument();
    expect(screen.getByTestId("dashboard-activity")).toBeEmptyDOMElement();

    await browser.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.queryByText("Private audit action")).not.toBeInTheDocument();
  }, 10000);

  it("ignores a privileged response that finishes after the next account signs in", async () => {
    let resolveAudit: ((response: Response) => void) | undefined;
    let resolveUsers: ((response: Response) => void) | undefined;
    const fetchMock = mockAuthenticatedApi(
      () => new Promise<Response>((resolve) => { resolveAudit = resolve; }),
      () => new Promise<Response>((resolve) => { resolveUsers = resolve; }),
    );
    render(<App />);
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/audit/events"))).toBe(true);
      expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/users"))).toBe(true);
    });
    const browser = await signInAsViewer();

    await act(async () => {
      resolveAudit?.(jsonResponse([event]));
      resolveUsers?.(jsonResponse([{ id: 7, email: "private.user@example.com", username: "private-user", role: "admin" }]));
    });
    await browser.type(screen.getByRole("searchbox"), "private.user@example.com");
    expect(screen.queryByText("private.user@example.com")).not.toBeInTheDocument();
    expect(screen.getByTestId("dashboard-activity")).toBeEmptyDOMElement();
    expect(screen.queryByText("Private audit action")).not.toBeInTheDocument();
  });

  it("drops privileged data immediately when the current account loses permission", async () => {
    mockAuthenticatedApi();
    const browser = userEvent.setup();
    render(<App />);
    await screen.findByText("Private audit action");
    await browser.type(screen.getByRole("searchbox"), "private.user@example.com");
    expect(await screen.findByText("private.user@example.com")).toBeInTheDocument();

    await browser.click(screen.getByRole("button", { name: "Settings" }));
    await browser.click(await screen.findByRole("button", { name: "Demote current account" }));
    await browser.type(screen.getByRole("searchbox"), "private.user@example.com");
    expect(screen.queryByText("private.user@example.com")).not.toBeInTheDocument();
    expect(screen.getByTestId("dashboard-activity")).toBeEmptyDOMElement();
  });
});
