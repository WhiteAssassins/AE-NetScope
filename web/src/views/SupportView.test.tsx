import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SupportView from "./SupportView";

describe("SupportView", () => {
  it("shows official contact channels", () => {
    render(<SupportView />);

    expect(screen.getByRole("heading", { name: "Soporte" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "contacto@aewhitedevs.com" })).toHaveAttribute(
      "href",
      "mailto:contacto@aewhitedevs.com",
    );
    expect(screen.getByRole("link", { name: "admin@aewhitedevs.com" })).toHaveAttribute(
      "href",
      "mailto:admin@aewhitedevs.com",
    );
    expect(screen.getByRole("link", { name: "aewhitedevs.com" })).toHaveAttribute(
      "href",
      "https://aewhitedevs.com",
    );
    expect(screen.getByRole("link", { name: "github.com/WhiteAssassins/AE-NetScope" })).toHaveAttribute(
      "href",
      "https://github.com/WhiteAssassins/AE-NetScope",
    );
  });
});
