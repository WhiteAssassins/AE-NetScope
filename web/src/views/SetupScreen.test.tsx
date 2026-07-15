import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import SetupScreen from "./SetupScreen";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("SetupScreen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates the first administrator", async () => {
    const user = userEvent.setup();
    const onSetupComplete = vi.fn();
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          csrf_token: "csrf-token",
          user: {
            id: 1,
            email: "owner@example.com",
            username: "owner",
            role: "admin",
            permissions: ["inventory:read"],
            must_change_password: false,
            preferred_language: "en",
          },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<SetupScreen onSetupComplete={onSetupComplete} />);

    await user.type(screen.getByLabelText("Administrator email"), "owner@example.com");
    await user.clear(screen.getByLabelText("Username"));
    await user.type(screen.getByLabelText("Username"), "owner");
    await user.type(screen.getByLabelText("Password"), "first-secure-password");
    await user.type(screen.getByLabelText("Confirm password"), "first-secure-password");
    await user.click(screen.getByRole("button", { name: "Create administrator" }));

    await waitFor(() => expect(onSetupComplete).toHaveBeenCalledTimes(1));
    expect(onSetupComplete).toHaveBeenCalledWith(
      expect.objectContaining({ email: "owner@example.com", role: "admin" }),
      "csrf-token",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/auth/setup"),
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          email: "owner@example.com",
          username: "owner",
          password: "first-secure-password",
          setup_token: null,
        }),
      }),
    );
  });

  it("submits the required installation token", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          csrf_token: "csrf-token",
          user: {
            id: 1,
            email: "owner@example.com",
            username: "owner",
            role: "admin",
            permissions: [],
            must_change_password: false,
            preferred_language: "en",
          },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<SetupScreen tokenRequired onSetupComplete={vi.fn()} />);

    await user.type(screen.getByLabelText("Initial setup token"), "installation-token");
    await user.type(screen.getByLabelText("Administrator email"), "owner@example.com");
    await user.type(screen.getByLabelText("Password"), "first-secure-password");
    await user.type(screen.getByLabelText("Confirm password"), "first-secure-password");
    await user.click(screen.getByRole("button", { name: "Create administrator" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/auth/setup"),
      expect.objectContaining({
        body: expect.stringContaining('"setup_token":"installation-token"'),
      }),
    );
  });

  it("rejects mismatched passwords before calling the API", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<SetupScreen onSetupComplete={vi.fn()} />);

    await user.type(screen.getByLabelText("Administrator email"), "owner@example.com");
    await user.type(screen.getByLabelText("Password"), "first-secure-password");
    await user.type(screen.getByLabelText("Confirm password"), "different-password");
    await user.click(screen.getByRole("button", { name: "Create administrator" }));

    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a conflict when setup was already completed", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse({ detail: "exists" }, 409))));

    render(<SetupScreen onSetupComplete={vi.fn()} />);

    await user.type(screen.getByLabelText("Administrator email"), "owner@example.com");
    await user.type(screen.getByLabelText("Password"), "first-secure-password");
    await user.type(screen.getByLabelText("Confirm password"), "first-secure-password");
    await user.click(screen.getByRole("button", { name: "Create administrator" }));

    expect(await screen.findByText("The initial administrator has already been created.")).toBeInTheDocument();
  });
});
