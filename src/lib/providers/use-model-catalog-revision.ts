import { useSyncExternalStore } from "react";
import {
  getDynamicModelCatalogRevision,
  subscribeDynamicModelCatalog,
} from "./model-catalog";

/** Re-read synchronous model metadata when runtime discovery updates it. */
export function useModelCatalogRevision() {
  return useSyncExternalStore(
    subscribeDynamicModelCatalog,
    getDynamicModelCatalogRevision,
    getDynamicModelCatalogRevision,
  );
}
