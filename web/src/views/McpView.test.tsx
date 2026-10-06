import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import McpView from "./McpView";

afterEach(() => { vi.unstubAllGlobals(); });

describe("McpView access", () => {
  it("does not load tokens without inventory read permission", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<McpView csrfToken="csrf" permissions={[]} />);

    expect(screen.getByText("You need inventory read access to manage MCP integrations.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create token" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("offers read-only token management and a setup guide to viewers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]", {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<McpView csrfToken="csrf" permissions={["inventory:read"]} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Create token" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open setup guide" })).toHaveAttribute(
      "href", "https://github.com/WhiteAssassins/AE-NetScope/blob/main/docs/mcp.md",
    );
  });
});
