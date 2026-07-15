import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../types";
import SettingsView from "./SettingsView";

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

describe("SettingsView", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads default local settings and English as the account language", () => {
    render(
      <SettingsView csrfToken="csrf-token" onUserChanged={vi.fn()} user={currentUser} />,
    );

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByLabelText("Language")).toHaveValue("en");
    expect(screen.getByLabelText("Preferred start view")).toHaveValue("dashboard");
    expect(screen.getByLabelText(/compact tables/i)).not.toBeChecked();
    expect(screen.getByLabelText(/show early public preview/i)).toBeChecked();
  });

  it("persists browser settings without an unnecessary language request", async () => {
    const user = userEvent.setup();
    const listener = vi.fn();
    const onUserChanged = vi.fn();
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ user: currentUser })));
    vi.stubGlobal("fetch", fetchMock);
    window.addEventListener("ae-netscope-settings-changed", listener);

    render(
      <SettingsView
        csrfToken="csrf-token"
        onUserChanged={onUserChanged}
        user={currentUser}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Preferred start view"), "devices");
    await user.click(screen.getByLabelText(/compact tables/i));
    await user.click(screen.getByRole("button", { name: /save settings/i }));

    await waitFor(() => expect(screen.getByText("Settings saved.")).toBeInTheDocument());
    expect(JSON.parse(window.localStorage.getItem("ae-netscope-settings") ?? "{}")).toMatchObject({
      defaultView: "devices",
      compactTables: true,
      showPreviewNotice: true,
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onUserChanged).not.toHaveBeenCalled();

    window.removeEventListener("ae-netscope-settings-changed", listener);
  });

  it("applies a manual language selection immediately and saves it", async () => {
    const user = userEvent.setup();
    const spanishUser = { ...currentUser, preferred_language: "es" };
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse({ user: spanishUser }))),
    );

    render(
      <SettingsView csrfToken="csrf-token" onUserChanged={vi.fn()} user={currentUser} />,
    );

    await user.selectOptions(screen.getByLabelText("Language"), "es");
    expect(await screen.findByRole("heading", { name: "Ajustes" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("es");
    await user.click(screen.getByRole("button", { name: /guardar ajustes/i }));
    expect(await screen.findByText("Ajustes guardados.")).toBeInTheDocument();
    expect(window.localStorage.getItem("ae-netscope-language")).toBe("es");
  });

  it("keeps local settings and restores the account language when the API fails", async () => {
    const user = userEvent.setup();
    const onUserChanged = vi.fn();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse({}, 500))));

    render(
      <SettingsView
        csrfToken="csrf-token"
        onUserChanged={onUserChanged}
        user={currentUser}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Language"), "es");
    await user.selectOptions(screen.getByLabelText("Vista inicial preferida"), "devices");
    await user.click(screen.getByRole("button", { name: /guardar ajustes/i }));

    expect(
      await screen.findByText(
        "Browser settings were saved, but the account language could not be updated.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByLabelText("Language")).toHaveValue("en");
    expect(window.localStorage.getItem("ae-netscope-language")).toBe("en");
    expect(JSON.parse(window.localStorage.getItem("ae-netscope-settings") ?? "{}")).toMatchObject({
      defaultView: "devices",
    });
    expect(onUserChanged).not.toHaveBeenCalled();
  });
});
