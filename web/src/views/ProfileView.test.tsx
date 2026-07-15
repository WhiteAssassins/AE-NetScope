import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "../types";
import ProfileView from "./ProfileView";

const currentUser: User = {
  id: 1,
  email: "admin@example.com",
  username: "admin",
  role: "admin",
  permissions: ["inventory:read", "users:manage"],
  must_change_password: false,
  preferred_language: "en",
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ProfileView", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows account identity and permissions", () => {
    render(
      <ProfileView
        csrfToken="csrf"
        onChangePassword={vi.fn()}
        onUserChanged={vi.fn()}
        user={currentUser}
      />,
    );

    expect(screen.getByRole("heading", { name: "Perfil" })).toBeInTheDocument();
    expect(screen.getByText("admin@example.com")).toBeInTheDocument();
    expect(screen.getByText("inventory:read")).toBeInTheDocument();
    expect(screen.getByText("users:manage")).toBeInTheDocument();
  });

  it("changes the current user email with password confirmation", async () => {
    const user = userEvent.setup();
    const onUserChanged = vi.fn();
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith("/auth/email")) {
        return Promise.resolve(
          jsonResponse({
            user: { ...currentUser, email: "admin@aewhitedevs.com" },
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ProfileView
        csrfToken="csrf-token"
        onChangePassword={vi.fn()}
        onUserChanged={onUserChanged}
        user={currentUser}
      />,
    );

    const emailInput = screen.getByDisplayValue("admin@example.com");
    await user.clear(emailInput);
    await user.type(emailInput, "admin@aewhitedevs.com");
    await user.type(screen.getByPlaceholderText("Contrasena actual"), "correct-password");
    await user.click(screen.getByRole("button", { name: "Cambiar correo" }));

    expect(await screen.findByText("Correo actualizado correctamente.")).toBeInTheDocument();
    expect(onUserChanged).toHaveBeenCalledWith(
      expect.objectContaining({ email: "admin@aewhitedevs.com" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/auth/email"),
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({ "X-CSRF-Token": "csrf-token" }),
        body: JSON.stringify({
          current_password: "correct-password",
          new_email: "admin@aewhitedevs.com",
        }),
      }),
    );
  });
});
