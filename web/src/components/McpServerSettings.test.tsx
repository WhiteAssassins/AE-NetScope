import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import McpServerSettings from "./McpServerSettings";

afterEach(() => { vi.unstubAllGlobals(); });

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });
}

describe("McpServerSettings", () => {
  it("lets administrators enable the built-in server and shows its endpoint", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) =>
      Promise.resolve(jsonResponse({
        enabled: init?.method === "PATCH", available: true, path: "/mcp",
      })));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<McpServerSettings csrfToken="csrf" canManage />);

    const toggle = await screen.findByRole("checkbox", { name: /Enable MCP server/ });
    expect(toggle).not.toBeChecked();
    expect(screen.queryByText("Endpoint")).not.toBeInTheDocument();

    await user.click(toggle);

    await waitFor(() => expect(toggle).toBeChecked());
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining("/integrations/mcp-server"),
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ enabled: true }) }),
    );
    expect(screen.getByText(`${window.location.origin}/mcp`)).toBeInTheDocument();
  });

  it("explains when the server is not installed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      jsonResponse({ enabled: false, available: false, path: "/mcp" }),
    ));

    render(<McpServerSettings csrfToken="csrf" canManage />);

    expect(await screen.findByText(/Not available in this installation/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("reports failures to change the setting", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ enabled: false, available: true, path: "/mcp" }))
      .mockResolvedValueOnce(jsonResponse({ detail: "Conflict" }, 409));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<McpServerSettings csrfToken="csrf" canManage />);
    await user.click(await screen.findByRole("checkbox", { name: /Enable MCP server/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to update the MCP server setting.");
  });
});
