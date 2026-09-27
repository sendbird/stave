import { readdir, readFile, access } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

/**
 * Temporary migrations read or convert names that Stave no longer uses (renamed
 * tables, columns, storage keys, ledger kinds) or replay a rename on another
 * branch. They are registered in `config/temporary-migrations.json` with the
 * first version that must no longer contain them, and every block of their code
 * carries a marker comment. This check fails once `package.json` reaches an
 * entry's `removeInVersion`, so a release cannot pass CI with expired
 * migration code still in the tree.
 */

const root = process.cwd();
const registryPath = "config/temporary-migrations.json";
const scannedRoots = ["src", "electron", "server", "scripts", "tests"];
const scannedExtensions = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"]);
const ignoredDirectories = new Set([
  ".git",
  ".stave",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const versionPattern = /^(\d+)\.(\d+)\.(\d+)$/;
const markerKeyword = ["temporary", "migration"].join("-");
const markerPattern = new RegExp(
  `^\\s*(?://|/\\*+|\\*|#)\\s*${markerKeyword}:\\s*([a-z0-9]+(?:-[a-z0-9]+)*)\\b`,
  "gm",
);

function parseVersion(value) {
  const match = typeof value === "string" ? value.match(versionPattern) : null;
  return match ? match.slice(1).map(Number) : null;
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

async function exists(relativePath) {
  try {
    await access(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function collectSourceFiles(relativePath) {
  const entries = await readdir(path.join(root, relativePath), {
    withFileTypes: true,
  }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) continue;
    const childPath = path.posix.join(relativePath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(childPath)));
    } else if (scannedExtensions.has(path.extname(entry.name))) {
      files.push(childPath);
    }
  }
  return files;
}

async function collectMarkers() {
  const markers = new Map();
  for (const scannedRoot of scannedRoots) {
    for (const file of await collectSourceFiles(scannedRoot)) {
      const source = await readFile(path.join(root, file), "utf8");
      for (const match of source.matchAll(markerPattern)) {
        const files = markers.get(match[1]) ?? new Set();
        files.add(file);
        markers.set(match[1], files);
      }
    }
  }
  return markers;
}

async function main() {
  const errors = [];
  const notices = [];
  const packageJson = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8"),
  );
  const currentVersion = parseVersion(packageJson.version);
  if (!currentVersion) {
    errors.push(`package.json version "${packageJson.version}" is not x.y.z.`);
  }

  let registry = { migrations: [] };
  if (await exists(registryPath)) {
    registry = JSON.parse(await readFile(path.join(root, registryPath), "utf8"));
  }
  const entries = Array.isArray(registry.migrations) ? registry.migrations : [];
  const markers = await collectMarkers();
  const registeredIds = new Set();

  for (const entry of entries) {
    const label = `temporary migration "${entry?.id ?? "<missing id>"}"`;
    if (typeof entry?.id !== "string" || !idPattern.test(entry.id)) {
      errors.push(`${label}: id must be kebab-case.`);
      continue;
    }
    if (registeredIds.has(entry.id)) {
      errors.push(`${label}: id is registered twice.`);
      continue;
    }
    registeredIds.add(entry.id);
    if (typeof entry.description !== "string" || entry.description.trim() === "") {
      errors.push(`${label}: description is required.`);
    }
    const introducedAfter = parseVersion(entry.introducedAfter);
    const removeInVersion = parseVersion(entry.removeInVersion);
    if (!introducedAfter || !removeInVersion) {
      errors.push(`${label}: introducedAfter and removeInVersion must be x.y.z.`);
    } else if (compareVersions(removeInVersion, introducedAfter) <= 0) {
      errors.push(`${label}: removeInVersion must be later than introducedAfter.`);
    }
    const files = Array.isArray(entry.files) ? entry.files : [];
    const tests = Array.isArray(entry.tests) ? entry.tests : [];
    if (files.length === 0) {
      errors.push(`${label}: list at least one file that carries its marker.`);
    }
    for (const file of [...files, ...tests]) {
      if (!(await exists(file))) {
        errors.push(`${label}: listed file ${file} does not exist.`);
      }
    }
    const markedFiles = markers.get(entry.id) ?? new Set();
    for (const file of files) {
      if (!markedFiles.has(file)) {
        errors.push(`${label}: ${file} has no "${markerKeyword}: ${entry.id}" marker.`);
      }
    }
    for (const file of markedFiles) {
      if (!files.includes(file)) {
        errors.push(`${label}: ${file} carries its marker but is not listed in files.`);
      }
    }
    if (currentVersion && removeInVersion) {
      const comparison = compareVersions(currentVersion, removeInVersion);
      if (comparison >= 0) {
        errors.push(
          [
            `${label} expired: package.json is ${packageJson.version} and it had to be removed in ${entry.removeInVersion}.`,
            `  Delete the marked blocks in: ${files.join(", ")}`,
            ...(tests.length ? [`  Delete its tests: ${tests.join(", ")}`] : []),
            `  Remove the entry from ${registryPath} and note in CHANGELOG that upgrades skipping those releases no longer convert the old data.`,
          ].join("\n"),
        );
      } else if (
        currentVersion[0] === removeInVersion[0] &&
        removeInVersion[1] - currentVersion[1] <= 1
      ) {
        notices.push(`${label} must be removed before ${entry.removeInVersion}.`);
      }
    }
  }

  for (const [id, files] of markers) {
    if (!registeredIds.has(id)) {
      errors.push(
        `Marker "${markerKeyword}: ${id}" in ${[...files].join(", ")} is not registered in ${registryPath}.`,
      );
    }
  }

  for (const notice of notices) console.log(`notice: ${notice}`);
  if (errors.length > 0) {
    console.error("Temporary migration check failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(
    `Temporary migration check passed (${entries.length} registered, version ${packageJson.version}).`,
  );
}

await main();
