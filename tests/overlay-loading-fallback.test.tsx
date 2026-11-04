import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyRuntimeLocale, i18n } from "@/i18n/runtime";
import { OverlayLoadingFallback } from "../src/components/layout/OverlayLoadingFallback";

afterEach(() => applyRuntimeLocale("en"));

describe("lazy dialog loading fallback", () => {
  test("is a busy loading surface with an announced label, not a card", () => {
    const html = renderToStaticMarkup(
      createElement(OverlayLoadingFallback, { title: "Settings" }),
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading Settings…");
    expect(html).not.toContain("...");
  });

  test("loading strings end in one ellipsis character in both locales", () => {
    for (const lng of ["en", "ko"]) {
      for (const key of ["loadingIssues", "loadingPanel", "loadingSurface"] as const) {
        const text = i18n.t(`shell:appShell.${key}`, { lng, title: "X" });
        expect(text.endsWith("…")).toBe(true);
      }
    }
    expect(i18n.t("shell:appShell.loadingIssues", { lng: "en" })).toBe("Loading issues…");
  });
});
