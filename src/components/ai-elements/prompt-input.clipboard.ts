import { i18n } from "@/i18n/runtime";
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

export function collectClipboardFiles(args: {
  items?: Iterable<ClipboardFileItem> | ArrayLike<ClipboardFileItem> | null;
  files?: Iterable<File> | ArrayLike<File> | null;
}) {
  const files = Array.from(args.items ?? []).flatMap((item) => {
    const file = item.getAsFile();
    return file ? [file] : [];
  });
  // The two clipboard lists describe the same selection. Match occurrences
  // across lists, never collapse different files within one list by metadata.
  const remaining = new Map<string, number>();
  for (const file of files) {
    const key = getClipboardFileKey(file);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  for (const file of Array.from(args.files ?? [])) {
    const key = getClipboardFileKey(file);
    const count = remaining.get(key) ?? 0;
    if (count > 0) remaining.set(key, count - 1);
    else files.push(file);
  }
  return files;
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

// Keep batches in paste order even when file reads complete at different speeds.
// Cancellation invalidates callbacks from a composer that changed tasks.
export function createClipboardReadQueue() {
  let tail = Promise.resolve();
  let pending = 0;
  let generation = 0;
  return {
    isPending: () => pending > 0,
    cancel: () => {
      generation += 1;
      pending = 0;
      tail = Promise.resolve();
    },
    enqueue<T>(read: () => Promise<T>, commit: (value: T) => void) {
      const startedGeneration = generation;
      pending += 1;
      const operation = tail.then(async () => {
        if (generation !== startedGeneration) return;
        try {
          const value = await read();
          if (generation === startedGeneration) commit(value);
        } catch (error) {
          if (generation === startedGeneration) throw error;
        } finally {
          if (generation === startedGeneration) pending -= 1;
        }
      });
      tail = operation.catch(() => {});
      return operation;
    },
  };
}

export function readClipboardImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const fail = () => reject(new Error(i18n.t("composer:promptInputClipboard.extraCopy66") + file.name));
    reader.onerror = fail;
    reader.onabort = fail;
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
        fail();
        return;
      }
      // Match the canonical IPC per-image limit before adding a draft chip.
      if (dataUrl.length > 10_000_000) {
        reject(new Error(i18n.t("composer:promptInputClipboard.extraCopy67") + file.name));
        return;
      }
      resolve(dataUrl);
    };
    reader.readAsDataURL(file);
  });
}
