import { constants, promises as fs, type BigIntStats } from "node:fs";
import {
  FILE_PREVIEW_CHUNK_BYTES,
  type FilePreviewRangeRequest,
  type FilePreviewRangeResult,
} from "../../../src/lib/fs/file-preview-reader";

function revisionOf(stat: BigIntStats) {
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(":");
}

export async function readFilePreviewRange(
  filePath: string,
  { offset, length, revision }: Omit<FilePreviewRangeRequest, "rootPath" | "filePath">,
): Promise<FilePreviewRangeResult> {
  if (
    !Number.isSafeInteger(offset) || offset < 0 ||
    !Number.isSafeInteger(length) || length < 0 || length > FILE_PREVIEW_CHUNK_BYTES
  ) {
    return { ok: false, reason: "unavailable" };
  }

  try {
    // Do not block the main process waiting for a named pipe to open.
    const file = await fs.open(filePath, constants.O_RDONLY | constants.O_NONBLOCK);
    try {
      const before = await file.stat({ bigint: true });
      const size = Number(before.size);
      if (!before.isFile() || !Number.isSafeInteger(size)) {
        return { ok: false, reason: "unavailable" };
      }

      const currentRevision = revisionOf(before);
      if (revision !== undefined && revision !== currentRevision) {
        return { ok: false, reason: "changed" };
      }

      const bytes = new Uint8Array(Math.min(length, Math.max(0, size - offset)));
      let read = 0;
      while (read < bytes.length) {
        const { bytesRead } = await file.read(bytes, read, bytes.length - read, offset + read);
        if (!bytesRead) {
          break;
        }
        read += bytesRead;
      }
      // Check the open handle and the path. An atomic replacement leaves the
      // handle readable, but subsequent requests would open a different file.
      const after = await file.stat({ bigint: true });
      const atPath = await fs.stat(filePath, { bigint: true });
      if (read !== bytes.length || revisionOf(after) !== currentRevision || revisionOf(atPath) !== currentRevision) {
        return { ok: false, reason: "changed" };
      }
      return { ok: true, revision: currentRevision, size, bytes };
    } finally {
      await file.close();
    }
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
    return { ok: false, reason: missing && revision !== undefined ? "changed" : "unavailable" };
  }
}
