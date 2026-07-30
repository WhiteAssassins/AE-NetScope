import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SupportView from "./SupportView";

describe("SupportView", () => {
  it("shows official contact channels", () => {
    const onOpenAbout = vi.fn();
    render(<SupportView onOpenAbout={onOpenAbout} />);

    expect(screen.getByRole("heading", { name: "Support" })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "About AE NetScope" }));
    expect(onOpenAbout).toHaveBeenCalledOnce();
  });
});
