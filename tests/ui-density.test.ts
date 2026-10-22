import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DENSITY_SETTING_FIELD_ID,
  DensitySettingsCard,
} from "@/components/layout/settings-sections/settings-dialog-density-card";
import { resolveSettingsSearch } from "@/components/layout/settings-search";
import { applyUiDensity } from "@/lib/themes";
import { defaultSettings, normalizeUiDensity } from "@/store/app-settings";

/** Just enough of a document for the attribute writers. */
function fakeDocument() {
  const dataset: Record<string, string> = {};
  Object.defineProperty(globalThis, "document", {
    value: { documentElement: { dataset } },
    configurable: true,
  });
  return dataset;
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "document");
});

describe("app density", () => {
  test("is Regular unless a profile chose Compact", () => {
    expect(defaultSettings.uiDensity).toBe("regular");
    expect(normalizeUiDensity("compact")).toBe("compact");
    for (const value of [undefined, null, "dense", 1]) expect(normalizeUiDensity(value)).toBe("regular");
  });

  test("marks the document only for Compact", () => {
    const dataset = fakeDocument();
    applyUiDensity({ density: "compact" });
    expect(dataset.uiDensity).toBe("compact");
    applyUiDensity({ density: "regular" });
    expect("uiDensity" in dataset).toBe(false);
  });

  test("its card can take the focus a Settings search result hands it", () => {
    // Search focuses the card by id; a section without a tabindex ignores
    // focus(), which leaves a keyboard user on the result.
    const html = renderToStaticMarkup(createElement(DensitySettingsCard));
    expect(html).toMatch(new RegExp(`<section[^>]*id="${DENSITY_SETTING_FIELD_ID}"[^>]*tabindex="-1"|<section[^>]*tabindex="-1"[^>]*id="${DENSITY_SETTING_FIELD_ID}"`));
  });

  test("Settings search finds it by the words people use", () => {
    for (const query of ["compact", "density", "row height"]) {
      expect(resolveSettingsSearch(query, { developerModeEnabled: false }).fields.map((field) => field.key)).toContain("uiDensity");
    }
  });
});
