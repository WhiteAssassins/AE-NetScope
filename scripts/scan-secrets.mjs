import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const ignoredDirectories = new Set([
  ".git",
  ".github",
  ".pytest_cache",
  ".ruff_cache",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "htmlcov",
  "node_modules",
  "venv",
]);
const ignoredFiles = new Set(["package-lock.json"]);
const ignoredPrefixes = [".env", "api/var/", "api/.local-"];
const textExtensions = new Set([
  ".cmd",
  ".css",
  ".ini",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".py",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml",
]);

const patterns = [
  { name: "private key block", regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { name: "GitHub token", regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}\b/ },
  { name: "GitHub fine-grained token", regex: /\bgithub_pat_[A-Za-z0-9_]{22,}_[A-Za-z0-9_]{59,}\b/ },
  { name: "AWS access key", regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "OpenAI API key", regex: /\bsk-[A-Za-z0-9_-]{32,}\b/ },
  { name: "Slack token", regex: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  { name: "Stripe secret key", regex: /\bsk_live_[A-Za-z0-9]{24,}\b/ },
];

function extensionOf(filePath) {
  const match = filePath.match(/\.[^.]+$/);
  return match ? match[0].toLowerCase() : "";
}

function shouldIgnore(filePath) {
  const normalized = relative(root, filePath).replaceAll("\\", "/");
  return ignoredFiles.has(normalized.split("/").at(-1) ?? "") || ignoredPrefixes.some((prefix) => normalized.startsWith(prefix));
}

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      return ignoredDirectories.has(entry) ? [] : walk(fullPath);
    }
    if (shouldIgnore(fullPath) || !textExtensions.has(extensionOf(entry))) {
      return [];
    }
    return [fullPath];
  });
}

const findings = [];
for (const filePath of walk(root)) {
  const content = readFileSync(filePath, "utf8");
  for (const pattern of patterns) {
    if (pattern.regex.test(content)) {
      findings.push(`${relative(root, filePath)}: possible ${pattern.name}`);
    }
  }
}

if (findings.length) {
  console.error("Potential secrets found:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log("No obvious hardcoded secrets found.");
