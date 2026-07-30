import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import GitHubButton from "./GitHubButton";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("GitHubButton", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows the cached star count and links to the repository", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            html_url: "https://github.com/WhiteAssassins/AE-NetScope",
            stargazers_count: 1250,
            forks_count: 15,
            open_issues_count: 4,
          }),
        ),
      ),
    );

    render(<GitHubButton />);

    const link = await screen.findByRole("link", {
      name: "Open AE NetScope on GitHub, 1250 stars",
    });
    expect(link).toHaveAttribute("href", "https://github.com/WhiteAssassins/AE-NetScope");
    expect(screen.getByText("1,250")).toBeInTheDocument();
  });

  it("still links to GitHub if repository metadata is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse({}, 503))));
    render(<GitHubButton />);

    expect(screen.getByRole("link", { name: "Open AE NetScope on GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/WhiteAssassins/AE-NetScope",
    );
  });
});
