import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { i18n } from "@/i18n/runtime";
import { SettingsAuxiliaryInferenceSection } from "@/components/layout/settings-dialog-auxiliary-inference-section";
import { AUX_LANES } from "@/lib/providers/auxiliary-inference-policy";
import { settingDefinitions } from "@/components/layout/settings-dialog.registry";
import {
  matchesSettingsSection,
  settingsSectionGroups,
  settingsSections,
} from "@/components/layout/settings-dialog.schema";

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
    expect(html).toContain("Claude Haiku 5.5");
    expect(html).toContain("claude-haiku-5-5");
    expect(html).not.toContain("claude-haiku-4-5");
  });

  test("leads with one shared utility model, then lane switches, then collapsed overrides", () => {
    const shared = html.indexOf("Utility model");
    const firstLane = html.indexOf("Run intent guard");
    const overrides = html.indexOf("Per-lane overrides");
    expect(shared).toBeGreaterThanOrEqual(0);
    expect(firstLane).toBeGreaterThan(shared);
    expect(overrides).toBeGreaterThan(firstLane);
    expect(html).toContain("Run background lanes on Codex.");
    expect(html).toContain("Automatic: each provider&#x27;s lightest model.");
    // A fresh profile overrides nothing.
    expect(html).not.toContain("Overrides the utility model.");
  });

  test("registers the utility model as its own importable setting", () => {
    const definition = settingDefinitions.find(
      (candidate) => candidate.key === "auxiliaryInferenceDefault",
    );
    expect(definition?.sectionId).toBe("auxiliaryInference");
    expect(definition?.importExport).toBe("include");
    expect(definition?.keywords).toContain("utility model");
  });

  test("is reachable from settings search and navigation", () => {
    const section = settingsSections.find(
      (candidate) => candidate.id === "auxiliaryInference",
    );
    expect(section?.labelKey).toBe("settings:sections.auxiliaryInference.label");
    expect(i18n.getFixedT("en")(section!.labelKey)).toBe("Background AI");
    expect(i18n.getFixedT("ko")(section!.labelKey)).toBe("백그라운드 AI");
    expect(section?.keywords).toContain("credits");
    expect(matchesSettingsSection(section!, "credits")).toBe(true);
    expect(
      settingsSectionGroups.some((group) => group.ids.includes("auxiliaryInference")),
    ).toBe(true);

    const definition = settingDefinitions.find(
      (candidate) => candidate.key === "auxiliaryInferencePolicy",
    );
    expect(definition?.sectionId).toBe("auxiliaryInference");
    expect(definition?.importExport).toBe("include");
  });
});
