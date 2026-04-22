import { spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import path from "node:path";

function isExecutablePath(value: string) {
  try {
    accessSync(value, process.platform === "win32" ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function findCommandOnPath(command: string) {
  const lookupCommand = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(lookupCommand, [command], {
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    return null;
  }
  const resolved = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (!resolved) {
    return null;
  }
  return resolved;
}

function sanitizeCommandName(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function resolveExecutable(args: { preferredValue?: string | null; fallbackCommands?: string[] }) {
  const preferredValue = args.preferredValue?.trim();
  const candidates = [
    ...(preferredValue ? [preferredValue] : []),
    ...(args.fallbackCommands ?? []),
  ];

  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (!trimmed) {
      continue;
    }

    if (path.isAbsolute(trimmed) || trimmed.includes("/") || trimmed.includes("\\")) {
      const absoluteCandidate = path.isAbsolute(trimmed) ? trimmed : path.resolve(trimmed);
      if (isExecutablePath(absoluteCandidate)) {
        return {
          command: absoluteCandidate,
          detail: absoluteCandidate,
        };
      }
      continue;
    }

    const sanitized = sanitizeCommandName(trimmed);
    if (!sanitized) {
      continue;
    }

    const resolved = findCommandOnPath(sanitized);
    if (resolved) {
      return {
        command: sanitized,
        detail: resolved,
      };
    }
  }

  return null;
}
