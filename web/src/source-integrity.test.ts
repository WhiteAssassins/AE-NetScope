import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = join(process.cwd(), "src");
const suspiciousEncodingMarkers = ["\u00c3", "\u00c2", "\u00e2\u20ac", "\ufffd"];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      return sourceFiles(fullPath);
    }
    return /\.(css|ts|tsx)$/.test(entry) ? [fullPath] : [];
  });
}

describe("source integrity", () => {
  it("does not contain common mojibake markers in source files", () => {
    const offenders = sourceFiles(sourceRoot).filter((filePath) => {
      const content = readFileSync(filePath, "utf8");
      return suspiciousEncodingMarkers.some((marker) => content.includes(marker));
    });

    expect(offenders).toEqual([]);
  });
});
