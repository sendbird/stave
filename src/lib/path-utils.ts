export function resolvePathBaseName(args: { path?: string | null; fallback?: string }) {
  const normalizedPath = args.path?.trim().replace(/[\\/]+$/, "");
  if (!normalizedPath) {
    return args.fallback ?? "";
  }

  return normalizedPath.split(/[\\/]/).filter(Boolean).at(-1) ?? (args.fallback ?? "");
}
