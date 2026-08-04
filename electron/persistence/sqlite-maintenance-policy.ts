export interface SqliteStorageMetrics {
  pageSizeBytes: number;
  pageCount: number;
  freePages: number;
  usedBytes: number;
  fileBytes: number;
  autoVacuum: number;
}

const FULL_VACUUM_MIN_FILE_BYTES = 256 * 1024 * 1024;
const FULL_VACUUM_MIN_FREE_BYTES = 128 * 1024 * 1024;
const FULL_VACUUM_MIN_FREE_RATIO = 0.25;
const FULL_VACUUM_DISK_MARGIN_BYTES = 256 * 1024 * 1024;

/**
 * Full VACUUM is reserved for shutdown and only runs when it will materially
 * shrink the file and there is enough space for SQLite's replacement copy.
 */
export function shouldRunFullVacuumMigration(args: {
  metrics: SqliteStorageMetrics;
  availableBytes: number;
}): boolean {
  const { metrics } = args;
  if (
    metrics.autoVacuum === 2 ||
    metrics.fileBytes < FULL_VACUUM_MIN_FILE_BYTES
  ) {
    return false;
  }
  const freeBytes = metrics.freePages * metrics.pageSizeBytes;
  const freeRatio =
    metrics.pageCount > 0 ? metrics.freePages / metrics.pageCount : 0;
  const requiredBytes = metrics.usedBytes * 1.5 + FULL_VACUUM_DISK_MARGIN_BYTES;
  return (
    freeBytes >= FULL_VACUUM_MIN_FREE_BYTES &&
    freeRatio >= FULL_VACUUM_MIN_FREE_RATIO &&
    args.availableBytes >= requiredBytes
  );
}
