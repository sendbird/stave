import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsAuxiliaryInferenceSection } from "@/components/layout/settings-dialog-auxiliary-inference-section";
import { AUX_LANES } from "@/lib/providers/auxiliary-inference-policy";
import { settingDefinitions } from "@/components/layout/settings-dialog.registry";
import { settingsSections } from "@/components/layout/settings-dialog.schema";

describe("Settings → Background AI", () => {
  const html = renderToStaticMarkup(
    createElement(SettingsAuxiliaryInferenceSection),
  );

  test("renders a card for every background lane", () => {
    expect(AUX_LANES.length).toBeGreaterThan(0);
    for (const title of [
      "Intent guard",
      "Turn summary",
      "Task naming",
      "Utility inference",
      "PR description",
      "Pre-PR review",
      "Inline completion",
    ]) {
      expect(html).toContain(title);
    }
  });

  test("says what each lane costs the user rather than only naming it", () => {
    expect(html).toContain("after each completed turn");
    expect(html).toContain("non-AI fallback draft");
    expect(html).toContain("keystroke debounce");
  });

  test("offers both managed providers per lane", () => {
    expect(html).toContain("Run this lane on Claude.");
    expect(html).toContain("Run this lane on Codex.");
  });

  test("shows the light-tier Haiku default in the model picker", () => {
    expect(html).toContain("Claude Haiku 4.5");
    expect(html).toContain("claude-haiku-4-5");
  });

  test("is reachable from settings search and navigation", () => {
    const section = settingsSections.find(
      (candidate) => candidate.id === "auxiliaryInference",
    );
    expect(section?.label).toBe("Background AI");
    expect(section?.keywords).toContain("credits");

    const definition = settingDefinitions.find(
      (candidate) => candidate.key === "auxiliaryInferencePolicy",
    );
    expect(definition?.sectionId).toBe("auxiliaryInference");
    expect(definition?.importExport).toBe("include");
  });
});
