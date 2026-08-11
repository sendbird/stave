import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const documentationRoots = ["AGENTS.md", "CLAUDE.md", "docs", "skills"];
const externalRepositoryMarker = "<!-- doc-path-check: external-repository -->";
const ignoredDirectories = new Set([
  ".git",
  ".stave",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);
const repositoryPathPrefixes = [
  ".github/",
  "build/",
  "config/",
  "docs/",
  "electron/",
  "public/",
  "scripts/",
  "server/",
  "site/",
  "skills/",
  "src/",
  "tests/",
];
const repositoryRootFiles = new Set([
  "AGENTS.md",
  "CHANGELOG.md",
  "CLAUDE.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "README.md",
  "bun.lock",
  "electron-builder.yml",
  "eslint.config.mjs",
  "package.json",
  "tsconfig.json",
  "tsconfig.node.json",
  "vite.site.config.ts",
]);
const sourceLikeBasenamePattern =
  /(?:\.(?:c|m)?(?:j|t)sx?|\.md|\.test\.(?:j|t)sx?)$/i;
const repositoryPathTokenPattern =
  /(?<![A-Za-z0-9_/@.-])((?:\.github|build|config|docs|electron|public|scripts|server|site|skills|src|tests)\/[A-Za-z0-9_@.*?/-]+)/g;
const intentionalNonRepositoryReferences = new Set([
  // Optional per-worktree policy file; it need not be present in this repo.
  "AGENTS.local.md",
  // Library name, not a repository-relative JavaScript file.
  "xterm.js",
]);
const ignoredReferencePrefixes = [
  "/tmp/",
  "<",
  "~",
  "app://",
  "file://",
  "http://",
  "https://",
  "mailto:",
  "node:",
  "skill://",
];

async function pathExists(candidate) {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(relativePath, predicate, directories) {
  const absolutePath = path.join(root, relativePath);
  const entries = await readdir(absolutePath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) continue;
    const childRelativePath = path.posix.join(relativePath, entry.name);
    if (entry.isDirectory()) {
      directories?.push(childRelativePath);
      files.push(
        ...(await collectFiles(childRelativePath, predicate, directories)),
      );
    } else if (predicate(childRelativePath)) {
      files.push(childRelativePath);
    }
  }

  return files;
}

async function collectDocumentationFiles() {
  const files = [];
  for (const relativePath of documentationRoots) {
    const absolutePath = path.join(root, relativePath);
    const entries = await readdir(absolutePath, {
      withFileTypes: true,
    }).catch(() => null);
    if (entries) {
      files.push(
        ...(await collectFiles(relativePath, (candidate) =>
          candidate.endsWith(".md"),
        )),
      );
    } else if (
      relativePath.endsWith(".md") &&
      (await pathExists(absolutePath))
    ) {
      files.push(relativePath);
    }
  }
  return files.sort();
}

function globToRegExp(pattern) {
  let expression = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*") {
      if (pattern[index + 1] === "*") {
        expression += ".*";
        index += 1;
      } else {
        expression += "[^/]*";
      }
    } else if (character === "?") {
      expression += "[^/]";
    } else {
      expression += character.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
    }
  }
  return new RegExp(`${expression}$`);
}

function stripPathLocation(reference) {
  return reference
    .replace(/^<|>$/g, "")
    .replace(/#.*$/, "")
    .replace(/:(?:L)?\d+(?::\d+)?$/, "")
    .replace(/[.,;:]$/, "");
}

function shouldIgnoreReference(reference) {
  return (
    reference.length === 0 ||
    reference.startsWith("#") ||
    ignoredReferencePrefixes.some((prefix) => reference.startsWith(prefix)) ||
    reference.includes("${") ||
    reference.includes("<") ||
    reference.includes(">") ||
    reference.includes("{") ||
    reference.includes("}") ||
    reference.includes("\\") ||
    /\s/.test(reference)
  );
}

function normalizeInlineReference(reference) {
  const stripped = stripPathLocation(reference.trim());
  if (
    shouldIgnoreReference(stripped) ||
    intentionalNonRepositoryReferences.has(stripped)
  ) {
    return null;
  }

  if (stripped.startsWith("@/")) {
    return `src/${stripped.slice(2)}`;
  }
  if (
    repositoryPathPrefixes.some((prefix) => stripped.startsWith(prefix)) ||
    repositoryRootFiles.has(stripped)
  ) {
    return stripped;
  }
  if (!stripped.includes("/") && sourceLikeBasenamePattern.test(stripped)) {
    return stripped;
  }
  return null;
}

function extractReferences(relativePath, source) {
  const references = [];
  const lines = source.split("\n");
  let fenceDelimiter = null;

  for (const [index, line] of lines.entries()) {
    // Bare repository paths remain auditable inside fenced diagrams and
    // examples. Authors can use placeholders for intentionally illustrative
    // paths; otherwise, a repository-looking path must continue to resolve.
    for (const match of line.matchAll(repositoryPathTokenPattern)) {
      const value = normalizeInlineReference(match[1]);
      if (value) {
        references.push({
          kind: "inline",
          line: index + 1,
          source: relativePath,
          value,
        });
      }
    }

    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (fenceDelimiter) {
      if (
        fenceMatch &&
        fenceMatch[1][0] === fenceDelimiter.character &&
        fenceMatch[1].length >= fenceDelimiter.length &&
        fenceMatch[2].trim().length === 0
      ) {
        fenceDelimiter = null;
      }
      continue;
    }
    if (fenceMatch) {
      fenceDelimiter = {
        character: fenceMatch[1][0],
        length: fenceMatch[1].length,
      };
      continue;
    }

    for (const match of line.matchAll(
      /!?\[[^\]]*]\(([^)\s]+)(?:\s+[^)]*)?\)/g,
    )) {
      references.push({
        kind: "link",
        line: index + 1,
        source: relativePath,
        value: match[1],
      });
    }
    for (const match of line.matchAll(/`([^`]+)`/g)) {
      const value = normalizeInlineReference(match[1]);
      if (value) {
        references.push({
          kind: "inline",
          line: index + 1,
          source: relativePath,
          value,
        });
      }
    }
  }

  return [
    ...new Map(
      references.map((reference) => [
        `${reference.line}:${reference.value}`,
        reference,
      ]),
    ).values(),
  ];
}

function resolveReference(reference) {
  const stripped = stripPathLocation(reference.value);
  if (reference.kind === "link") {
    const linkTarget = stripped.replace(/\?.*$/, "");
    if (shouldIgnoreReference(linkTarget)) return null;
    if (linkTarget.startsWith("/")) {
      const repositoryRelativePath = linkTarget.slice(1);
      return repositoryPathPrefixes.some((prefix) =>
        repositoryRelativePath.startsWith(prefix),
      )
        ? repositoryRelativePath
        : null;
    }
    return path.posix.normalize(
      path.posix.join(path.posix.dirname(reference.source), linkTarget),
    );
  }
  return stripped.includes("/") ? path.posix.normalize(stripped) : stripped;
}

const documentationFiles = await collectDocumentationFiles();
const collectedDirectories = [];
const repositoryFiles = await collectFiles(
  ".",
  () => true,
  collectedDirectories,
);
const repositoryPaths = new Set(
  repositoryFiles.map((relativePath) => relativePath.replace(/^\.\//, "")),
);
// Existence checks use these walk-derived sets instead of the filesystem so
// results stay identical between case-insensitive macOS and case-sensitive CI.
const repositoryDirectoryPaths = new Set(
  collectedDirectories.map((relativePath) => relativePath.replace(/^\.\//, "")),
);
const repositoryBasenames = new Set(
  repositoryFiles.map((relativePath) => path.posix.basename(relativePath)),
);
const failures = [];

for (const documentationFile of documentationFiles) {
  const source = await readFile(path.join(root, documentationFile), "utf8");
  // Cross-repository design artifacts can intentionally use paths that only
  // resolve in the named sibling repository. The marker must be the first
  // line so an ordinary guide cannot disable checks accidentally.
  if (source.startsWith(`${externalRepositoryMarker}\n`)) continue;
  for (const reference of extractReferences(documentationFile, source)) {
    const rawResolved = resolveReference(reference);
    if (!rawResolved) continue;
    // Trim trailing slashes so directory references match the directory set.
    const resolved = rawResolved.replace(/\/+$/, "");
    if (!resolved) continue;
    if (resolved.startsWith("../")) {
      failures.push(
        `${reference.source}:${reference.line}: ${reference.value} escapes the repository`,
      );
      continue;
    }

    let exists;
    if (!resolved.includes("/")) {
      // Trimmed top-level directory references ("src/" -> "src") land here
      // alongside bare file basenames, so consult both sets.
      exists =
        repositoryBasenames.has(resolved) ||
        repositoryDirectoryPaths.has(resolved);
    } else if (/[*?]/.test(resolved)) {
      const matcher = globToRegExp(resolved);
      exists =
        [...repositoryPaths].some((candidate) => matcher.test(candidate)) ||
        [...repositoryDirectoryPaths].some((candidate) =>
          matcher.test(candidate),
        );
    } else {
      exists =
        repositoryPaths.has(resolved) || repositoryDirectoryPaths.has(resolved);
    }

    if (!exists) {
      failures.push(
        `${reference.source}:${reference.line}: ${reference.value} -> ${resolved}`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error("Documentation path check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Documentation path check passed (${documentationFiles.length} Markdown files).`,
);
