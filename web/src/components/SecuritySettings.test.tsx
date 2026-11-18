import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "../types";
import SecuritySettings from "./SecuritySettings";

const currentUser: User = {
  id: 1,
  email: "admin@example.com",
  username: "admin",
  role: "admin",
  permissions: ["settings:manage"],
  must_change_password: false,
  preferred_language: "en",
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const capability = { enabled: true, rp_id: "test", origin: "http://test" };
const passkeys = [{ id: 3, name: "Laptop key", created_at: "2026-07-01T12:00:00Z", last_used_at: null }];
const sessions = [
  {
    id: 1,
    user_agent: "Mozilla/5.0 (X11; Linux x86_64) Firefox/130.0",
    ip_address: "10.0.0.5",
    created_at: "2026-07-20T12:00:00Z",
    expires_at: "2099-07-20T12:00:00Z",
    last_seen_at: "2026-07-20T12:00:00Z",
    is_current: true,
  },
];

function requestUrl(input: string | URL | Request) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

describe("SecuritySettings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists sessions and closes the other ones", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = requestUrl(input);
      if (init?.method === "DELETE") return Promise.resolve(new Response(null, { status: 204 }));
      if (url.endsWith("/passkeys/capability")) return Promise.resolve(jsonResponse(capability));
      if (url.endsWith("/security/passkeys")) return Promise.resolve(jsonResponse(passkeys));
      return Promise.resolve(jsonResponse(sessions));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SecuritySettings csrfToken="csrf" onUserChanged={vi.fn()} user={currentUser} />);

    expect(await screen.findByText(/Firefox · Linux \(current\)/)).toBeInTheDocument();
    expect(screen.getByText("Laptop key")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /close other sessions/i }));

    expect(await screen.findByText("Other sessions were closed.")).toBeInTheDocument();
  });

  it("asks for the password before removing a passkey", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = requestUrl(input);
      if (init?.method === "DELETE") return Promise.resolve(new Response(null, { status: 204 }));
      if (url.endsWith("/passkeys/capability")) return Promise.resolve(jsonResponse(capability));
      if (url.endsWith("/security/passkeys")) return Promise.resolve(jsonResponse(passkeys));
      return Promise.resolve(jsonResponse(sessions));
    }));

    render(<SecuritySettings csrfToken="csrf" onUserChanged={vi.fn()} user={currentUser} />);
    await user.click(await screen.findByRole("button", { name: "Remove passkey" }));
    expect(
      screen.getByText("Enter your current password before removing a passkey."),
    ).toBeInTheDocument();

    await user.type(screen.getAllByPlaceholderText("Password")[1], "secret-password");
    await user.click(screen.getByRole("button", { name: "Remove passkey" }));
    expect(await screen.findByText("Passkey removed.")).toBeInTheDocument();
  });

  it("clears an earlier error when TOTP is enabled", async () => {
    const user = userEvent.setup();
    const onUserChanged = vi.fn();
    let setupAttempts = 0;
    vi.stubGlobal("fetch", vi.fn((input: string | URL | Request) => {
      const url = requestUrl(input);
      if (url.endsWith("/auth/totp/setup")) {
        setupAttempts += 1;
        return Promise.resolve(
          setupAttempts === 1
            ? jsonResponse({}, 401)
            : jsonResponse({ secret: "JBSWY3DPEHPK3PXP", otpauth_uri: "otpauth://totp/test" }),
        );
      }
      if (url.endsWith("/auth/totp/confirm")) {
        return Promise.resolve(jsonResponse({ user: { ...currentUser, totp_enabled: true } }));
      }
      if (url.endsWith("/passkeys/capability")) return Promise.resolve(jsonResponse(capability));
      return Promise.resolve(jsonResponse([]));
    }));

    render(<SecuritySettings csrfToken="csrf" onUserChanged={onUserChanged} user={currentUser} />);
    await user.click(await screen.findByRole("button", { name: "Set up TOTP" }));
    expect(await screen.findByText("The security action could not be completed.")).toBeInTheDocument();

    await user.type(screen.getAllByPlaceholderText("Password")[0], "secret-password");
    await user.click(screen.getByRole("button", { name: "Set up TOTP" }));
    expect(await screen.findByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("6-digit code"), "123456");
    await user.click(screen.getByRole("button", { name: "Confirm and enable" }));

    expect(await screen.findByText("TOTP authentication enabled.")).toBeInTheDocument();
    expect(screen.queryByText("The security action could not be completed.")).not.toBeInTheDocument();
    expect(onUserChanged).toHaveBeenCalledWith(expect.objectContaining({ totp_enabled: true }));
  });

  it("disables TOTP with the current password and a code", async () => {
    const user = userEvent.setup();
    const onUserChanged = vi.fn();
    vi.stubGlobal("fetch", vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.endsWith("/auth/totp") && init?.method === "DELETE") {
        return Promise.resolve(jsonResponse({ user: { ...currentUser, totp_enabled: false } }));
      }
      if (url.endsWith("/passkeys/capability")) return Promise.resolve(jsonResponse(capability));
      return Promise.resolve(jsonResponse([]));
    }));

    render(
      <SecuritySettings
        csrfToken="csrf"
        onUserChanged={onUserChanged}
        user={{ ...currentUser, totp_enabled: true }}
      />,
    );
    await user.type(screen.getAllByPlaceholderText("Password")[0], "secret-password");
    await user.type(screen.getByPlaceholderText("6-digit code"), "123456");
    await user.click(screen.getByRole("button", { name: "Disable TOTP" }));

    expect(await screen.findByText("TOTP authentication disabled.")).toBeInTheDocument();
    expect(onUserChanged).toHaveBeenCalledWith(expect.objectContaining({ totp_enabled: false }));
  });

  it("explains when the browser cannot create passkeys", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("navigator", { ...navigator, credentials: undefined });
    vi.stubGlobal("fetch", vi.fn((input: string | URL | Request) =>
      Promise.resolve(
        jsonResponse(requestUrl(input).endsWith("/passkeys/capability") ? capability : []),
      ),
    ));

    render(<SecuritySettings csrfToken="csrf" onUserChanged={vi.fn()} user={currentUser} />);
    await user.click(await screen.findByRole("button", { name: "Add passkey" }));

    expect(screen.getByText("This browser does not support passkeys.")).toBeInTheDocument();
  });

  it("reports a failure when other sessions cannot be closed", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const url = requestUrl(input);
        if (init?.method === "DELETE") return Promise.resolve(jsonResponse({}, 500));
        if (url.endsWith("/passkeys/capability")) {
          return Promise.resolve(jsonResponse({ enabled: false, rp_id: null, origin: null }));
        }
        return Promise.resolve(jsonResponse([]));
      }),
    );

    render(<SecuritySettings csrfToken="csrf" onUserChanged={vi.fn()} user={currentUser} />);
    await user.click(await screen.findByRole("button", { name: /close other sessions/i }));

    expect(
      await screen.findByText("The security action could not be completed."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Other sessions were closed.")).not.toBeInTheDocument();
  });
});
