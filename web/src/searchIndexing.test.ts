import { afterEach, describe, expect, it } from "vitest";
import { applySearchIndexingPolicy } from "./searchIndexing";

describe("search indexing policy", () => {
  afterEach(() => {
    document.querySelector('meta[name="robots"]')?.remove();
  });

  it("creates and updates the robots meta directive", () => {
    applySearchIndexingPolicy(false);
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex, nofollow, noarchive",
    );

    applySearchIndexingPolicy(true);
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute(
      "content",
      "index, follow",
    );
  });
});
