import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const errors = [];

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function fail(message) {
  errors.push(message);
}

function expectEqual(label, actual, expected) {
  if (actual !== expected) {
    fail(`${label} is "${actual}", expected "${expected}".`);
  }
}

function expectIncludes(label, haystack, needle) {
  if (!haystack.includes(needle)) {
    fail(`${label} does not include "${needle}".`);
  }
}

function normalizePythonVersion(value) {
  const match = value.match(/^(.*)a(\d+)$/);
  if (!match) {
    return value;
  }
  return match[2] === "0" ? `${match[1]}-alpha` : `${match[1]}-alpha.${match[2]}`;
}

function matchFirst(label, text, pattern) {
  const match = text.match(pattern);
  if (!match) {
    fail(`${label} was not found.`);
    return "";
  }
  return match[1];
}

const version = readText("VERSION").trim();
const tag = `v${version}`;
const image = `ghcr.io/whiteassassins/ae-netscope:${tag}`;

if (!/^\d+\.\d+\.\d+(?:-[a-z0-9][a-z0-9.-]*)?$/.test(version)) {
  fail(`VERSION "${version}" is not a valid public release version.`);
}

expectEqual("root package.json version", readJson("package.json").version, version);
expectEqual("web package.json version", readJson("web/package.json").version, version);
expectEqual("web package-lock root version", readJson("web/package-lock.json").version, version);
expectEqual(
  "web package-lock package version",
  readJson("web/package-lock.json").packages[""].version,
  version,
);

const pyproject = readText("api/pyproject.toml");
const apiVersion = matchFirst("api pyproject version", pyproject, /^version = "([^"]+)"/m);
expectEqual("api pyproject version", normalizePythonVersion(apiVersion), version);

const dockerfile = readText("Dockerfile");
expectIncludes("Dockerfile OCI version label", dockerfile, `org.opencontainers.image.version="${version}"`);
expectIncludes("Dockerfile OCI license label", dockerfile, 'org.opencontainers.image.licenses="MIT"');

const publishWorkflow = readText(".github/workflows/publish-container.yml");
expectIncludes(
  "GHCR workflow open source description",
  publishWorkflow,
  "org.opencontainers.image.description=Open source LAN inventory",
);
expectIncludes(
  "GHCR workflow MIT license label",
  publishWorkflow,
  "org.opencontainers.image.licenses=MIT",
);

const compose = readText("compose.yaml");
expectIncludes("compose image tag", compose, `image: ${image}`);

const readme = readText("README.md");
expectIncludes("README current release notes", readme, `RELEASE_NOTES_${tag}.md`);
expectIncludes("README container image", readme, image);

const releaseNotesPath = `RELEASE_NOTES_${tag}.md`;
if (!fs.existsSync(path.join(root, releaseNotesPath))) {
  fail(`${releaseNotesPath} does not exist.`);
} else {
  const releaseNotes = readText(releaseNotesPath);
  expectIncludes(`${releaseNotesPath} title`, releaseNotes, `# AE NetScope ${tag}`);
  expectIncludes(`${releaseNotesPath} image`, releaseNotes, image);
}

const truenasApp = readText("truenas/ix-dev/community/ae-netscope/app.yaml");
expectIncludes("TrueNAS app version", truenasApp, `app_version: ${version}`);

const truenasValues = readText("truenas/ix-dev/community/ae-netscope/ix_values.yaml");
expectIncludes("TrueNAS image tag", truenasValues, `tag: ${tag}`);

const truenasReadme = readText("truenas/README.md");
expectIncludes("TrueNAS README image tag", truenasReadme, image);
expectIncludes("TrueNAS README app version", truenasReadme, `App version: \`${version}\``);

if (errors.length > 0) {
  console.error("Release metadata validation failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Release metadata is aligned for ${tag}.`);
