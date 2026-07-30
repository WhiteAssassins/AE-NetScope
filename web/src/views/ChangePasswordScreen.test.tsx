import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ChangePasswordScreen from "./ChangePasswordScreen";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ChangePasswordScreen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("changes the password with CSRF protection", async () => {
    const user = userEvent.setup();
    const onPasswordChanged = vi.fn();
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
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

    render(<ChangePasswordScreen csrfToken="csrf-token" onPasswordChanged={onPasswordChanged} />);

    await user.type(screen.getByLabelText("Current password"), "old-secure-password");
    await user.type(screen.getByLabelText("New password"), "new-secure-password");
    await user.type(screen.getByLabelText("Confirm password"), "new-secure-password");
    await user.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() => expect(onPasswordChanged).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/auth/password"),
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({ "X-CSRF-Token": "csrf-token" }),
        body: JSON.stringify({
          current_password: "old-secure-password",
          new_password: "new-secure-password",
        }),
      }),
    );
  });

  it("rejects mismatched passwords locally", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<ChangePasswordScreen csrfToken="csrf-token" onPasswordChanged={vi.fn()} />);

    await user.type(screen.getByLabelText("Current password"), "old-secure-password");
    await user.type(screen.getByLabelText("New password"), "new-secure-password");
    await user.type(screen.getByLabelText("Confirm password"), "different-password");
    await user.click(screen.getByRole("button", { name: "Update password" }));

    expect(screen.getByText("The passwords do not match.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows expired session errors from the API", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse({ detail: "csrf" }, 403))));

    render(<ChangePasswordScreen csrfToken="bad-token" onPasswordChanged={vi.fn()} />);

    await user.type(screen.getByLabelText("Current password"), "old-secure-password");
    await user.type(screen.getByLabelText("New password"), "new-secure-password");
    await user.type(screen.getByLabelText("Confirm password"), "new-secure-password");
    await user.click(screen.getByRole("button", { name: "Update password" }));

    expect(
      await screen.findByText("Your session expired. Sign in again."),
    ).toBeInTheDocument();
  });
});
