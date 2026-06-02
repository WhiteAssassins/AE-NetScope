import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RolesPermissionsView from "./RolesPermissionsView";

describe("RolesPermissionsView", () => {
  it("renders the public role summaries", () => {
    render(<RolesPermissionsView />);

    expect(screen.getByRole("heading", { name: "Roles y permisos" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Admin" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Operador" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Solo lectura" })).toBeInTheDocument();
  });

  it("shows admin can manage users and viewer cannot", () => {
    render(<RolesPermissionsView />);

    const row = screen.getByText("Gestionar usuarios").closest(".permissions-row");
    expect(row).not.toBeNull();
    const cells = within(row as HTMLElement).getAllByText(/Permitido|No/);

    expect(cells.map((cell) => cell.textContent)).toEqual(["Permitido", "No", "No"]);
  });

  it("shows viewer can read inventory only", () => {
    render(<RolesPermissionsView />);

    const readInventoryRow = screen.getByText("Leer inventario").closest(".permissions-row");
    const deleteDeviceRow = screen.getByText("Eliminar dispositivos").closest(".permissions-row");
    expect(readInventoryRow).not.toBeNull();
    expect(deleteDeviceRow).not.toBeNull();

    expect(within(readInventoryRow as HTMLElement).getAllByText("Permitido")).toHaveLength(3);
    expect(within(deleteDeviceRow as HTMLElement).getAllByText(/Permitido|No/).map((cell) => cell.textContent)).toEqual([
      "Permitido",
      "No",
      "No",
    ]);
  });
});
