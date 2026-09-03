import { existsSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      resolve(data);
    });
    process.stdin.on("error", reject);
  });
}

function safeExec(args, cwd) {
  try {
    return execFileSync(args[0], args.slice(1), {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function resolveRepoRoot(cwd) {
  return safeExec(["git", "rev-parse", "--show-toplevel"], cwd) || cwd;
}

function listChangedFiles(repoRoot) {
  const output = safeExec(
    ["git", "status", "--short", "--untracked-files=no"],
    repoRoot,
  );
  if (!output) {
    return [];
  }
  return output
    .split(/\r?\n/g)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const match = line.match(/^[ MADRCU?!]{1,2}\s+(.*)$/);
      return match?.[1]?.trim() ?? line.trim();
    })
    .filter(Boolean)
    .slice(0, 8);
}

function toRelative(repoRoot, targetPath) {
  return path.relative(repoRoot, targetPath) || ".";
}

function loadKeyDocs(repoRoot) {
  const candidates = [
    "AGENTS.md",
    "CLAUDE.md",
    "docs/architecture/index.md",
    "docs/architecture/entrypoints.md",
    "docs/architecture/contracts.md",
    "docs/architecture/runtime.md",
  ];
  return candidates.filter((candidate) =>
    existsSync(path.join(repoRoot, candidate)),
  );
}

function buildAdditionalContext(args) {
  const lines = [
    "[Repository preflight]",
    `cwd: ${args.relativeCwd}`,
    `repoRoot: ${args.repoRootName}`,
    `branch: ${args.branch || "unknown"}`,
    `permissionMode: ${args.permissionMode}`,
  ];

  if (args.keyDocs.length > 0) {
    lines.push("read-first docs:");
    for (const doc of args.keyDocs.slice(0, 5)) {
      lines.push(`- ${doc}`);
    }
  }

  if (args.changedFiles.length > 0) {
    lines.push("dirty files:");
    for (const file of args.changedFiles) {
      lines.push(`- ${file}`);
    }
  }

  lines.push(
    "exploration rule: prefer docs/architecture -> targeted rg -> contract files before scanning broad directories.",
  );

  return lines.join("\n");
}

const rawInput = await readStdin();
const payload = rawInput ? JSON.parse(rawInput) : {};
const cwd =
  typeof payload.cwd === "string" && payload.cwd ? payload.cwd : process.cwd();
const repoRoot = resolveRepoRoot(cwd);
const branch = safeExec(["git", "branch", "--show-current"], repoRoot);
const keyDocs = loadKeyDocs(repoRoot);
const changedFiles = listChangedFiles(repoRoot);

const additionalContext = buildAdditionalContext({
  relativeCwd: toRelative(repoRoot, cwd),
  repoRootName: path.basename(repoRoot),
  branch,
  permissionMode: payload.permission_mode ?? "default",
  keyDocs,
  changedFiles,
});

process.stdout.write(
  JSON.stringify({
    continue: true,
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext,
    },
  }),
);
