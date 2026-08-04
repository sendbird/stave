import { describe, expect, test } from "bun:test";
import { shouldRunFullVacuumMigration } from "../electron/persistence/sqlite-maintenance-policy";

const GIB = 1024 * 1024 * 1024;

describe("SQLite maintenance policy", () => {
  test("migrates a materially bloated legacy database with enough disk", () => {
    expect(
      shouldRunFullVacuumMigration({
        metrics: {
          pageSizeBytes: 4_096,
          pageCount: 589_824,
          freePages: 458_752,
          usedBytes: 512 * 1024 * 1024,
          fileBytes: 2.25 * GIB,
          autoVacuum: 0,
        },
        availableBytes: 10 * GIB,
      }),
    ).toBe(true);
  });

  test("does not block shutdown for small or insufficiently bloated files", () => {
    expect(
      shouldRunFullVacuumMigration({
        metrics: {
          pageSizeBytes: 4_096,
          pageCount: 32_768,
          freePages: 16_384,
          usedBytes: 64 * 1024 * 1024,
          fileBytes: 128 * 1024 * 1024,
          autoVacuum: 0,
        },
        availableBytes: 10 * GIB,
      }),
    ).toBe(false);
  });

  test("does not rerun the full migration once incremental vacuum is enabled", () => {
    expect(
      shouldRunFullVacuumMigration({
        metrics: {
          pageSizeBytes: 4_096,
          pageCount: 589_824,
          freePages: 458_752,
          usedBytes: 512 * 1024 * 1024,
          fileBytes: 2.25 * GIB,
          autoVacuum: 2,
        },
        availableBytes: 10 * GIB,
      }),
    ).toBe(false);
  });

  test("skips migration when the replacement copy would exhaust disk", () => {
    expect(
      shouldRunFullVacuumMigration({
        metrics: {
          pageSizeBytes: 4_096,
          pageCount: 589_824,
          freePages: 458_752,
          usedBytes: 512 * 1024 * 1024,
          fileBytes: 2.25 * GIB,
          autoVacuum: 0,
        },
        availableBytes: 512 * 1024 * 1024,
      }),
    ).toBe(false);
  });
});
