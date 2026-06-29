import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SettingsView from "./SettingsView";

describe("SettingsView", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads default local settings", () => {
    render(<SettingsView />);

    expect(screen.getByRole("heading", { name: "Ajustes" })).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("dashboard");
    expect(screen.getByLabelText(/tablas compactas/i)).not.toBeChecked();
    expect(screen.getByLabelText(/mostrar aviso/i)).toBeChecked();
  });

  it("persists settings and dispatches the settings changed event", async () => {
    const user = userEvent.setup();
    const listener = vi.fn();
    window.addEventListener("ae-netscope-settings-changed", listener);

    render(<SettingsView />);

    await user.selectOptions(screen.getByRole("combobox"), "devices");
    await user.click(screen.getByLabelText(/tablas compactas/i));
    await user.click(screen.getByRole("button", { name: /guardar ajustes/i }));

    expect(JSON.parse(window.localStorage.getItem("ae-netscope-settings") ?? "{}")).toMatchObject({
      defaultView: "devices",
      compactTables: true,
      showPreviewNotice: true,
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Ajustes guardados en este navegador.")).toBeInTheDocument();

    window.removeEventListener("ae-netscope-settings-changed", listener);
  });
});
