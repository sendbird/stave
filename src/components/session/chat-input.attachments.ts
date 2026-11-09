function normalizeWorkspacePath(value: string) {
  return value.replaceAll("\\", "/").replace(/\/+$/, "");
}

function normalizeComparableWorkspacePath(value: string) {
  const normalized = normalizeWorkspacePath(value);
  return /^[a-z]:\//i.test(normalized) || normalized.startsWith("//")
    ? normalized.toLowerCase()
    : normalized;
}

export function resolvePastedFileAbsolutePath(args: {
  file: File;
  getPathForFile?: (file: File) => string;
}): string | null {
  // Electron 32+ removed the legacy `File.path` property; the preload-exposed
  // `webUtils.getPathForFile` bridge is the only supported mapping there. The
  // `File.path` fallback keeps non-Electron/browser-mode behavior unchanged.
  if (args.getPathForFile) {
    try {
      const resolved = args.getPathForFile(args.file).trim();
      if (resolved) {
        return resolved;
      }
    } catch {
      // Fall through to the legacy property.
    }
  }
  const legacyPath = (args.file as File & { path?: string }).path?.trim();
  return legacyPath || null;
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

export type AttachmentImportEntry =
  | { absolutePath: string }
  | { name: string; data: Uint8Array };

/**
 * What the main process needs to attach pasted or dropped files: the disk
 * path when the file has one, otherwise its bytes (a file dragged from a
 * browser or copied from an app that only puts data on the clipboard).
 */
export async function buildAttachmentImportEntries(args: {
  files: readonly File[];
  getPathForFile?: (file: File) => string;
}): Promise<AttachmentImportEntry[]> {
  const entries: AttachmentImportEntry[] = [];
  for (const file of args.files) {
    const absolutePath = resolvePastedFileAbsolutePath({
      file,
      getPathForFile: args.getPathForFile,
    });
    if (absolutePath) {
      entries.push({ absolutePath });
      continue;
    }
    entries.push({
      name: file.name || "attachment",
      data: new Uint8Array(await file.arrayBuffer()),
    });
  }
  return entries;
}

/** Appends paths not attached yet, keeping the existing order. */
export function mergeAttachedFilePaths(current: readonly string[], incoming: readonly string[]) {
  const next = [...current];
  for (const filePath of incoming) {
    if (filePath && !next.includes(filePath)) next.push(filePath);
  }
  return next;
}

type ImportAttachments = (args: {
  rootPath: string;
  entries: AttachmentImportEntry[];
}) => Promise<{ filePaths: string[]; failures: { name: string }[] }>;

/**
 * Resolves pasted or dropped files to workspace-relative paths. With the
 * desktop bridge, files from anywhere attach (outside files are copied into
 * the workspace). Without it (browser mode) only workspace files can attach.
 */
export async function resolveComposerFileAttachments(args: {
  files: readonly File[];
  rootPath: string;
  importAttachments?: ImportAttachments;
  getPathForFile?: (file: File) => string;
}): Promise<{ filePaths: string[]; failures: { name: string }[] }> {
  if (args.importAttachments) {
    try {
      return await args.importAttachments({
        rootPath: args.rootPath,
        entries: await buildAttachmentImportEntries(args),
      });
    } catch {
      return { filePaths: [], failures: args.files.map((file) => ({ name: file.name })) };
    }
  }
  const filePaths: string[] = [];
  for (const file of args.files) {
    const absolutePath = resolvePastedFileAbsolutePath({ file, getPathForFile: args.getPathForFile });
    const relativePath = absolutePath
      ? toWorkspaceRelativeFilePath({ absolutePath, rootPath: args.rootPath })
      : null;
    if (relativePath) filePaths.push(relativePath);
  }
  return { filePaths, failures: [] };
}
