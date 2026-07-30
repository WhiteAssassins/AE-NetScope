import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RolesPermissionsView from "./RolesPermissionsView";

describe("RolesPermissionsView", () => {
  it("renders the public role summaries", () => {
    render(<RolesPermissionsView />);

    expect(screen.getByRole("heading", { name: "Roles and permissions" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Admin" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Operator" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Read-only" })).toBeInTheDocument();
  });

  it("shows admin can manage users and viewer cannot", () => {
    render(<RolesPermissionsView />);

    const row = screen.getByText("Manage users").closest(".permissions-row");
    expect(row).not.toBeNull();
    const cells = within(row as HTMLElement).getAllByText(/Allowed|No/);

    expect(cells.map((cell) => cell.textContent)).toEqual(["Allowed", "No", "No"]);
  });

  it("shows viewer can read inventory only", () => {
    render(<RolesPermissionsView />);

    const readInventoryRow = screen.getByText("Read inventory").closest(".permissions-row");
    const deleteDeviceRow = screen.getByText("Delete devices").closest(".permissions-row");
    expect(readInventoryRow).not.toBeNull();
    expect(deleteDeviceRow).not.toBeNull();

    expect(within(readInventoryRow as HTMLElement).getAllByText("Allowed")).toHaveLength(3);
    expect(within(deleteDeviceRow as HTMLElement).getAllByText(/Allowed|No/).map((cell) => cell.textContent)).toEqual([
      "Allowed",
      "No",
      "No",
    ]);
  });
});
