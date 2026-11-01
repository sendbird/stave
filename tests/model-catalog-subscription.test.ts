import { expect, test } from "bun:test";
import {
  getDynamicModelCatalogRevision,
  registerDynamicDefaultReasoningEfforts,
  registerDynamicDisplayNames,
  registerDynamicSupportedReasoningEfforts,
  subscribeDynamicModelCatalog,
} from "@/lib/providers/model-catalog";

test("catalog subscribers see metadata changes, ignore identical or invalid data, and detach", () => {
  const model = "catalog-subscription-fixture";
  const revisions: number[] = [];
  const start = getDynamicModelCatalogRevision();
  const unsubscribe = subscribeDynamicModelCatalog(() => revisions.push(getDynamicModelCatalogRevision()));
  try {
    registerDynamicDisplayNames(new Map([[model, "Catalog fixture"]]));
    registerDynamicDefaultReasoningEfforts(new Map([[model, "high"]]));
    registerDynamicSupportedReasoningEfforts(new Map([[model, ["low", "high"]]]));
    expect(revisions).toEqual([start + 1, start + 2, start + 3]);
    registerDynamicDisplayNames(new Map([[model, "Catalog fixture"]]));
    registerDynamicDefaultReasoningEfforts(new Map([[model, "high"], ["invalid-default", "unknown"]]));
    registerDynamicSupportedReasoningEfforts(new Map([[model, ["low", "high"]], ["invalid-supported", ["unknown"]]]));
    expect(getDynamicModelCatalogRevision()).toBe(start + 3);
    expect(revisions).toHaveLength(3);
  } finally {
    unsubscribe();
  }
  registerDynamicDefaultReasoningEfforts(new Map([[model, "low"]]));
  expect(revisions).toHaveLength(3);
});
