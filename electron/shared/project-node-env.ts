import {
  accessSync,
  constants,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

interface InstalledNodeVersion {
  directoryName: string;
  parts: readonly [number, number, number];
}

export interface ProjectNvmEnvironment {
  nvmrcPath: string;
  nvmDir: string;
  version: string;
  binPath: string;
  includePath: string;
}

function isDirectory(targetPath: string) {
  try {
    return statSync(targetPath).isDirectory();
  } catch {
    return false;
  }
}

function canExecute(targetPath: string) {
  try {
    accessSync(
      targetPath,
      process.platform === "win32" ? constants.F_OK : constants.X_OK,
    );
    return true;
  } catch {
    return false;
  }
}

function readNvmVersionSpecifier(filePath: string) {
  try {
    return (
      readFileSync(filePath, "utf8")
        .split(/\r?\n/)
        .map((line) => line.replace(/(?:^|\s+)#.*$/, "").trim())
        .find(Boolean) ?? ""
    );
  } catch {
    return "";
  }
}

function findNearestNvmrc(cwd: string) {
  let currentPath = path.resolve(cwd);
  if (!isDirectory(currentPath)) {
    currentPath = path.dirname(currentPath);
  }

  while (true) {
    const candidate = path.join(currentPath, ".nvmrc");
    if (readNvmVersionSpecifier(candidate)) {
      return candidate;
    }
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      return null;
    }
    currentPath = parentPath;
  }
}

function parseInstalledVersion(
  directoryName: string,
): InstalledNodeVersion | null {
  const match = directoryName.match(/^v?(\d+)\.(\d+)\.(\d+)(?:-.+)?$/);
  if (!match) {
    return null;
  }
  return {
    directoryName,
    parts: [Number(match[1]), Number(match[2]), Number(match[3])],
  };
}

function compareInstalledVersions(
  left: InstalledNodeVersion,
  right: InstalledNodeVersion,
) {
  for (let index = 0; index < left.parts.length; index += 1) {
    const difference = left.parts[index]! - right.parts[index]!;
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

function listInstalledNodeVersions(nvmDir: string) {
  const versionsRoot = path.join(nvmDir, "versions", "node");
  try {
    return readdirSync(versionsRoot)
      .map(parseInstalledVersion)
      .filter((entry): entry is InstalledNodeVersion => Boolean(entry))
      .filter((entry) => {
        const binPath = path.join(versionsRoot, entry.directoryName, "bin");
        return isDirectory(binPath) && canExecute(path.join(binPath, "node"));
      })
      .sort((left, right) => compareInstalledVersions(right, left));
  } catch {
    return [];
  }
}

function resolveAliasSpecifier(args: {
  nvmDir: string;
  specifier: string;
  seen: Set<string>;
}) {
  const normalized = args.specifier
    .trim()
    .replace(/^--lts(?:=(.+))?$/, (_match, name: string | undefined) =>
      name ? `lts/${name}` : "lts/*",
    );
  if (!normalized || args.seen.has(normalized)) {
    return normalized;
  }
  args.seen.add(normalized);

  const isSafeAlias = /^[a-zA-Z0-9._*-]+$/.test(normalized);
  const ltsAliasName = normalized.startsWith("lts/") ? normalized.slice(4) : "";
  const aliasPath =
    normalized === "lts/*"
      ? null
      : ltsAliasName && /^[a-zA-Z0-9._*-]+$/.test(ltsAliasName)
        ? path.join(args.nvmDir, "alias", "lts", ltsAliasName)
        : isSafeAlias
          ? path.join(args.nvmDir, "alias", normalized)
          : null;
  if (aliasPath) {
    const aliasValue = readNvmVersionSpecifier(aliasPath);
    if (aliasValue) {
      return resolveAliasSpecifier({
        ...args,
        specifier: aliasValue,
      });
    }
  }

  if (normalized === "lts/*") {
    const ltsAliasRoot = path.join(args.nvmDir, "alias", "lts");
    try {
      const candidates = readdirSync(ltsAliasRoot)
        .map((name) => readNvmVersionSpecifier(path.join(ltsAliasRoot, name)))
        .map(parseInstalledVersion)
        .filter((entry): entry is InstalledNodeVersion => Boolean(entry))
        .sort((left, right) => compareInstalledVersions(right, left));
      return candidates[0]?.directoryName ?? normalized;
    } catch {
      return normalized;
    }
  }

  return normalized;
}

function selectInstalledVersion(args: {
  installed: InstalledNodeVersion[];
  specifier: string;
}) {
  const normalized = args.specifier.replace(/^v/, "");
  if (normalized === "node" || normalized === "stable") {
    return args.installed[0] ?? null;
  }

  const numericMatch = normalized.match(
    /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-.+)?$/,
  );
  if (!numericMatch) {
    return null;
  }
  const requestedParts = numericMatch
    .slice(1)
    .filter((part): part is string => part !== undefined)
    .map(Number);
  return (
    args.installed.find((entry) =>
      requestedParts.every((part, index) => entry.parts[index] === part),
    ) ?? null
  );
}

export function resolveProjectNvmEnvironment(args: {
  cwd: string;
  baseEnv?: NodeJS.ProcessEnv;
}): ProjectNvmEnvironment | null {
  if (process.platform === "win32") {
    return null;
  }

  const nvmrcPath = findNearestNvmrc(args.cwd);
  if (!nvmrcPath) {
    return null;
  }

  const env = args.baseEnv ?? process.env;
  const homeDirectory = env.HOME?.trim() || homedir();
  const configuredNvmDir = env.NVM_DIR?.trim();
  const nvmDir =
    configuredNvmDir === "~"
      ? homeDirectory
      : configuredNvmDir?.startsWith("~/")
        ? path.join(homeDirectory, configuredNvmDir.slice(2))
        : path.resolve(configuredNvmDir || path.join(homeDirectory, ".nvm"));
  const installed = listInstalledNodeVersions(nvmDir);
  const requestedVersion = readNvmVersionSpecifier(nvmrcPath);
  const resolvedSpecifier = resolveAliasSpecifier({
    nvmDir,
    specifier: requestedVersion,
    seen: new Set(),
  });
  const selected = selectInstalledVersion({
    installed,
    specifier: resolvedSpecifier,
  });
  if (!selected) {
    return null;
  }

  const versionRoot = path.join(
    nvmDir,
    "versions",
    "node",
    selected.directoryName,
  );
  return {
    nvmrcPath,
    nvmDir,
    version: selected.directoryName,
    binPath: path.join(versionRoot, "bin"),
    includePath: path.join(versionRoot, "include", "node"),
  };
}

export function buildProjectShellEnv(args: {
  cwd: string;
  baseEnv?: NodeJS.ProcessEnv;
}) {
  const env = { ...(args.baseEnv ?? process.env) };
  const projectNvm = resolveProjectNvmEnvironment({
    cwd: args.cwd,
    baseEnv: env,
  });
  if (!projectNvm) {
    return env;
  }

  const pathEntries = (env.PATH ?? "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
  env.PATH = [
    projectNvm.binPath,
    ...pathEntries.filter((entry) => entry !== projectNvm.binPath),
  ].join(path.delimiter);
  env.NVM_DIR = projectNvm.nvmDir;
  env.NVM_BIN = projectNvm.binPath;
  env.NVM_INC = projectNvm.includePath;
  return env;
}

export function buildProjectNvmShellConfigOverrides(args: {
  cwd: string;
  baseEnv?: NodeJS.ProcessEnv;
}) {
  const projectNvm = resolveProjectNvmEnvironment(args);
  if (!projectNvm) {
    return {};
  }
  const env = buildProjectShellEnv(args);
  return {
    "shell_environment_policy.set.PATH": env.PATH ?? "",
    "shell_environment_policy.set.NVM_DIR": projectNvm.nvmDir,
    "shell_environment_policy.set.NVM_BIN": projectNvm.binPath,
    "shell_environment_policy.set.NVM_INC": projectNvm.includePath,
  } satisfies Record<string, string>;
}
