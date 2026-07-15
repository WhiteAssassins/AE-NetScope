import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import LoginScreen from "./LoginScreen";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("LoginScreen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("submits credentials and returns the logged in user", async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          csrf_token: "csrf-token",
          user: {
            id: 1,
            email: "admin@example.com",
            username: "admin",
            role: "admin",
            permissions: ["inventory:read"],
            must_change_password: false,
            preferred_language: "en",
          },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<LoginScreen onLogin={onLogin} />);

    await user.type(screen.getByLabelText("Email"), "admin@example.com");
    await user.type(screen.getByLabelText("Password"), "correct-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    expect(onLogin).toHaveBeenCalledWith(
      expect.objectContaining({ email: "admin@example.com" }),
      "csrf-token",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/auth/login"),
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ email: "admin@example.com", password: "correct-password" }),
      }),
    );
  });

  it("shows invalid credentials and locked account errors", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ detail: "bad credentials" }, 401))
      .mockResolvedValueOnce(jsonResponse({ detail: "locked" }, 423));
    vi.stubGlobal("fetch", fetchMock);

    render(<LoginScreen onLogin={vi.fn()} />);

    await user.type(screen.getByLabelText("Email"), "admin@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Invalid email or password.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("The account is temporarily locked.")).toBeInTheDocument();
  });

  it("shows a connection error when the API cannot be reached", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));

    render(<LoginScreen message="Sesión expirada" onLogin={vi.fn()} />);

    expect(screen.getByText("Sesión expirada")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Email"), "admin@example.com");
    await user.type(screen.getByLabelText("Password"), "correct-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Could not connect to the API.")).toBeInTheDocument();
  });
});
