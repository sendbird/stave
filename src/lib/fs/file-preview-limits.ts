export const WORKSPACE_TEXT_FILE_PREVIEW_MAX_BYTES = 1024 * 1024;
export const WORKSPACE_IMAGE_PREVIEW_MAX_BYTES = 8 * 1024 * 1024;

export function formatFileSize(bytes: number | null | undefined) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) {
    return "unknown size";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB", "TB"] as const;
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const fractionDigits = value >= 10 ? 0 : 1;
  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`;
}
