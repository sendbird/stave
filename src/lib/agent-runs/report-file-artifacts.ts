/**
 * Which non-HTML report artifacts Stave copies into app data so a report
 * survives its workspace (see `electron/host-service/supervision/report-file-artifacts.ts`),
 * and how the renderer recognises such a copy.
 */

/** The largest file copied; a bigger one stays a link to the original. */
export const REPORT_FILE_ARTIFACT_MAX_BYTES = 20 * 1024 * 1024;

const COPIED_EXTENSIONS = new Set([
  // Images
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif",
  // Text and logs
  "txt", "log", "out", "err", "md", "markdown", "csv", "tsv",
  // JSON
  "json", "jsonl", "ndjson",
  // Documents
  "pdf",
]);

/** Whether a file path (or `file://` URL path) has a type that is copied. */
export function isReportFileArtifactPath(filePath: string): boolean {
  const name = filePath.slice(Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\")) + 1).toLowerCase();
  const dot = name.lastIndexOf(".");
  return dot > 0 && COPIED_EXTENSIONS.has(name.slice(dot + 1));
}

/**
 * A copy the host saved: a `file://` URL with the host-only `savedAt` stamp.
 * Main still checks the file is inside its archive before opening it.
 */
export function isSavedReportFileArtifact(artifact: { url: string; savedAt?: string }): boolean {
  if (!artifact.savedAt) return false;
  try {
    return new URL(artifact.url).protocol === "file:";
  } catch {
    return false;
  }
}
