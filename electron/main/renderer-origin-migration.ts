// temporary-migration: renderer-origin-storage
/**
 * One-time copy of the renderer's localStorage from the `file://` origin to the
 * renderer scheme origin (see `renderer-entry.ts`).
 *
 * localStorage is partitioned by origin, so moving the renderer off `file://`
 * would otherwise start every existing profile from empty settings, drafts and
 * UI preferences.
 *
 * Invariant: the app loads from the new origin only when the marker exists, and
 * the marker is written only after every source entry has been read back from
 * the new origin through a fresh page. So while the marker is missing the app
 * has never written to the new origin, the `file://` copy is authoritative, and
 * overwriting the new origin with it on a retry cannot lose anything. Any
 * failure, including a timeout, leaves the marker unwritten and the caller
 * keeps loading the renderer from `file://` for that launch.
 */

export type StorageEntries = Array<[string, string]>;

export interface RendererOriginMigrationDeps {
  /** The marker file written after a verified copy. */
  hasMarker: () => boolean;
  /**
   * False for a profile no earlier Stave has used, so there is nothing at the
   * `file://` origin to copy and no page needs to be opened.
   */
  profileMayHaveLegacyStorage: () => boolean;
  readSource: () => Promise<StorageEntries>;
  writeTarget: (entries: StorageEntries) => Promise<void>;
  readTarget: () => Promise<StorageEntries>;
  flush: () => Promise<void>;
  writeMarker: (summary: { entryCount: number; migratedAt: string }) => void;
  /** Release any page the migration still holds (after success, failure or timeout). */
  dispose: () => void;
  now?: () => Date;
}

export type RendererOriginMigrationResult =
  | { status: "already-migrated" }
  | { status: "migrated"; entryCount: number }
  | { status: "failed"; reason: string };

export function findUnmigratedKeys(
  source: StorageEntries,
  target: StorageEntries,
): string[] {
  const targetValues = new Map(target);
  return source
    .filter(([key, value]) => targetValues.get(key) !== value)
    .map(([key]) => key);
}

class MigrationCancelled extends Error {}

async function migrate(
  deps: RendererOriginMigrationDeps,
  isCancelled: () => boolean,
): Promise<RendererOriginMigrationResult> {
  const assertActive = () => {
    if (isCancelled()) throw new MigrationCancelled("cancelled");
  };
  if (deps.hasMarker()) {
    return { status: "already-migrated" };
  }
  const migratedAt = (deps.now?.() ?? new Date()).toISOString();
  let entryCount = 0;
  if (deps.profileMayHaveLegacyStorage()) {
    const source = await deps.readSource();
    assertActive();
    await deps.writeTarget(source);
    await deps.flush();
    assertActive();
    const missing = findUnmigratedKeys(source, await deps.readTarget());
    if (missing.length > 0) {
      return {
        status: "failed",
        reason: `verification found ${missing.length} unmatched key(s)`,
      };
    }
    entryCount = source.length;
  }
  // Checked synchronously right before the write: a timeout that already told
  // the caller to load `file://` must never be followed by a marker.
  assertActive();
  deps.writeMarker({ entryCount, migratedAt });
  return { status: "migrated", entryCount };
}

export async function runRendererOriginStorageMigration(
  deps: RendererOriginMigrationDeps,
  options: { timeoutMs: number },
): Promise<RendererOriginMigrationResult> {
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<RendererOriginMigrationResult>((resolve) => {
    timer = setTimeout(() => {
      settled = true;
      resolve({
        status: "failed",
        reason: `timed out after ${options.timeoutMs}ms`,
      });
    }, options.timeoutMs);
  });
  const work = migrate(deps, () => settled).catch(
    (error): RendererOriginMigrationResult => ({
      status: "failed",
      reason: error instanceof Error ? error.message : String(error),
    }),
  );
  try {
    return await Promise.race([work, timeout]);
  } finally {
    settled = true;
    if (timer !== null) clearTimeout(timer);
    deps.dispose();
  }
}
