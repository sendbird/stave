export function resolvePathBaseName(args: { path?: string | null; fallback?: string }) {
  const normalizedPath = args.path?.trim().replace(/[\\/]+$/, "");
  if (!normalizedPath) {
    return args.fallback ?? "";
  }

  return normalizedPath.split(/[\\/]/).filter(Boolean).at(-1) ?? (args.fallback ?? "");
}

/**
 * True when the path is rooted, on either posix or Windows. Standalone CLI and
 * folder pickers reject relative paths because the PTY host silently falls back
 * to `process.cwd()` for non-absolute values.
 */
export function isAbsolutePosixOrWindowsPath(candidate: string) {
  return candidate.startsWith("/") || /^[A-Za-z]:[\\/]/.test(candidate);
}
