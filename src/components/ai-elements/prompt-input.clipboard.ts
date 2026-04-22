type ClipboardFileItem = {
  getAsFile: () => File | null;
};

function getClipboardFileKey(file: File) {
  const absolutePath = (file as File & { path?: string }).path?.trim();
  if (absolutePath) {
    return absolutePath;
  }
  return `${file.name}:${file.type}:${file.size}:${file.lastModified}`;
}

function addClipboardFile(target: Map<string, File>, file: File | null) {
  if (!file) {
    return;
  }
  const key = getClipboardFileKey(file);
  if (!target.has(key)) {
    target.set(key, file);
  }
}

export function collectClipboardFiles(args: {
  items?: Iterable<ClipboardFileItem> | ArrayLike<ClipboardFileItem> | null;
  files?: Iterable<File> | ArrayLike<File> | null;
}) {
  const dedupedFiles = new Map<string, File>();

  for (const item of Array.from(args.items ?? [])) {
    addClipboardFile(dedupedFiles, item.getAsFile());
  }

  for (const file of Array.from(args.files ?? [])) {
    addClipboardFile(dedupedFiles, file);
  }

  return Array.from(dedupedFiles.values());
}

export function partitionClipboardFiles(files: readonly File[]) {
  const imageFiles: File[] = [];
  const nonImageFiles: File[] = [];

  for (const file of files) {
    if (file.type.startsWith("image/")) {
      imageFiles.push(file);
      continue;
    }
    nonImageFiles.push(file);
  }

  return { imageFiles, nonImageFiles };
}

export function mergeClipboardImageAttachments<T extends { dataUrl: string }>(args: {
  existing?: readonly T[] | null;
  incoming: readonly T[];
}) {
  const deduped = new Map<string, T>();

  for (const attachment of args.existing ?? []) {
    const key = getClipboardImageAttachmentKey(attachment.dataUrl);
    if (!key || deduped.has(key)) {
      continue;
    }
    deduped.set(key, attachment);
  }

  for (const attachment of args.incoming) {
    const key = getClipboardImageAttachmentKey(attachment.dataUrl);
    if (!key || deduped.has(key)) {
      continue;
    }
    deduped.set(key, attachment);
  }

  return Array.from(deduped.values());
}

function getClipboardImageAttachmentKey(dataUrl: string) {
  const normalized = dataUrl.trim();
  if (!normalized) {
    return normalized;
  }

  const separatorIndex = normalized.indexOf(",");
  if (separatorIndex === -1) {
    return normalized;
  }

  const header = normalized.slice(0, separatorIndex).toLowerCase();
  const payload = normalized.slice(separatorIndex + 1).trim();
  if (!payload) {
    return normalized;
  }

  // Clipboard providers can surface the same binary with different data URL MIME headers.
  // Deduping by payload prevents those aliases from becoming duplicate pasted attachments.
  if (header.startsWith("data:") && header.includes(";base64")) {
    return payload;
  }

  return normalized;
}
