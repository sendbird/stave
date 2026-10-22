import type { AsyncState } from "@/components/system/AsyncBoundary";
import type { SkillCatalogState } from "@/store/app-store.types";

/**
 * The skill catalog as a boundary state: pending until a read answers for
 * these roots, an error when no read has succeeded, and the last lists read,
 * marked stale under the failure, when a later read fails.
 */
export function skillCatalogLoadState(
  catalog: SkillCatalogState,
  /** False when nothing will read the catalog (skills off, no workspace): show it as it is. */
  reading = true,
): AsyncState<SkillCatalogState> {
  if (!reading) return { status: "ready", data: catalog };
  if (catalog.loadedAt) {
    return catalog.status === "error"
      ? { status: "ready", data: catalog, stale: true, refreshError: catalog.detail }
      : { status: "ready", data: catalog };
  }
  return catalog.status === "error" ? { status: "error", error: catalog.detail } : { status: "pending" };
}
