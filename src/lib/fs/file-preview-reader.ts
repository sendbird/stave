export const FILE_PREVIEW_CHUNK_BYTES = 256 * 1024;
export const PDF_PREVIEW_MAX_BYTES = 64 * 1024 * 1024;

export interface FilePreviewRangeRequest {
  rootPath: string;
  filePath: string;
  offset: number;
  length: number;
  revision?: string;
}

export type FilePreviewRangeResult =
  | { ok: true; revision: string; size: number; bytes: Uint8Array }
  | { ok: false; reason: "changed" | "unavailable" };

export type FilePreviewReader = (
  range: Omit<FilePreviewRangeRequest, "rootPath" | "filePath">,
) => Promise<FilePreviewRangeResult>;

export class FilePreviewReadError extends Error {
  constructor(readonly reason: "changed" | "unavailable" | "binary" | "pdf-too-large") {
    super(reason);
  }
}

export async function readPreviewRange(
  reader: FilePreviewReader,
  range: Parameters<FilePreviewReader>[0],
) {
  const result = await reader(range);
  if (!result.ok) {
    throw new FilePreviewReadError(result.reason);
  }
  return result;
}
