function normalizeWorkspacePath(value: string) {
  return value.replaceAll("\\", "/").replace(/\/+$/, "");
}

function normalizeComparableWorkspacePath(value: string) {
  return normalizeWorkspacePath(value).toLowerCase();
}

export function toWorkspaceRelativeFilePath(args: {
  absolutePath: string;
  rootPath: string;
}) {
  const normalizedRoot = normalizeWorkspacePath(args.rootPath);
  const normalizedAbsolute = normalizeWorkspacePath(args.absolutePath);
  const comparableRoot = normalizeComparableWorkspacePath(args.rootPath);
  const comparableAbsolute = normalizeComparableWorkspacePath(args.absolutePath);

  if (!comparableAbsolute.startsWith(`${comparableRoot}/`)) {
    return null;
  }

  return normalizedAbsolute.slice(normalizedRoot.length + 1);
}
