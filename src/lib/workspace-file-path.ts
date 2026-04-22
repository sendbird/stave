function decodeFilePathInput(value: string) {
  let decoded = value.trim();
  if (/^file:\/\//i.test(decoded)) {
    decoded = decoded.replace(/^file:\/+/i, "/");
    if (/^\/[a-z]:\//i.test(decoded)) {
      decoded = decoded.slice(1);
    }
  }

  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Keep the original path when decoding fails.
  }

  return decoded;
}

function stripFilePathDecorators(value: string) {
  return value
    .split("?")[0]!
    .split("#")[0]!
    .replace(/:\d+(?::\d+)?$/, "");
}

function normalizeWorkspaceRootPath(workspacePath?: string) {
  const normalized = (workspacePath ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+$/, "");

  if (/^\/[a-z]:\//i.test(normalized)) {
    return normalized.slice(1);
  }
  return normalized;
}

export function normalizeRelativeWorkspaceFilePath(args: { filePath: string; allowEmpty?: boolean }) {
  const normalized = stripFilePathDecorators(decodeFilePathInput(args.filePath))
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");

  if (!normalized) {
    return args.allowEmpty ? "" : null;
  }

  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) {
    return args.allowEmpty ? "" : null;
  }
  if (parts.some((segment) => segment === "." || segment === "..")) {
    return null;
  }

  return parts.join("/");
}

export function resolveWorkspaceRelativeFilePath(args: {
  filePath: string;
  workspacePath?: string;
}) {
  let normalized = stripFilePathDecorators(decodeFilePathInput(args.filePath)).replace(/\\/g, "/");
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("/")) {
    const normalizedWorkspaceRoot = normalizeWorkspaceRootPath(args.workspacePath);
    if (!normalizedWorkspaceRoot) {
      return null;
    }

    const workspacePrefix = `${normalizedWorkspaceRoot}/`;
    while (normalized === normalizedWorkspaceRoot || normalized.startsWith(workspacePrefix)) {
      normalized = normalized === normalizedWorkspaceRoot
        ? ""
        : normalized.slice(workspacePrefix.length);
    }

    if (normalized.startsWith("/")) {
      return null;
    }
  }

  return normalizeRelativeWorkspaceFilePath({ filePath: normalized });
}

export function formatWorkspaceFilePathForDisplay(args: {
  filePath: string;
  workspacePath?: string;
}) {
  return resolveWorkspaceRelativeFilePath(args)
    ?? stripFilePathDecorators(decodeFilePathInput(args.filePath)).replace(/\\/g, "/").replace(/\/+$/, "");
}
