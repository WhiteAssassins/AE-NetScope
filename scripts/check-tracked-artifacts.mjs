import { execFileSync } from "node:child_process";

const forbiddenPatterns = [
  { name: "virtual environment", regex: /(^|\/)(\.venv|venv)(\/|$)/ },
  { name: "Node dependencies", regex: /(^|\/)node_modules(\/|$)/ },
  { name: "build output", regex: /(^|\/)(dist|build)(\/|$)/ },
  { name: "coverage output", regex: /(^|\/)(coverage|htmlcov)(\/|$)|(^|\/)(coverage\.xml|test-report\.txt)$/ },
  { name: "Python cache", regex: /(^|\/)(__pycache__|\.pytest_cache|\.ruff_cache)(\/|$)/ },
  { name: "local admin credentials", regex: /(^|\/)\.local-admin\.txt$/ },
  { name: "local database", regex: /\.(db|sqlite|sqlite3)$/ },
  { name: "log file", regex: /\.log$/ },
  { name: "environment file", regex: /(^|\/)\.env(\..*)?$/ },
];

const allowedTrackedFiles = new Set([".env.example"]);
const trackedFiles = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean)
  .map((filePath) => filePath.replaceAll("\\", "/"));

const findings = trackedFiles.flatMap((filePath) => {
  if (allowedTrackedFiles.has(filePath)) {
    return [];
  }
  return forbiddenPatterns
    .filter((pattern) => pattern.regex.test(filePath))
    .map((pattern) => `${filePath}: tracked ${pattern.name}`);
});

if (findings.length) {
  console.error("Forbidden local/generated files are tracked:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log("No forbidden local/generated files are tracked.");
