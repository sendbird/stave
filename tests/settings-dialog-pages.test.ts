import { describe, expect, test } from "bun:test";
import { i18n } from "@/i18n/runtime";
import {
  getSettingsPageId,
  listVisibleSettingsPageSections,
  listVisibleSettingsPages,
  resolveSettingsPageSection,
  settingsPageGroups,
  settingsPages,
} from "@/components/layout/settings-dialog.pages";
import { settingsSections } from "@/components/layout/settings-dialog.schema";

const HIDDEN_DEVELOPER = { developerModeEnabled: false };
const SHOWN_DEVELOPER = { developerModeEnabled: true };

describe("settings pages", () => {
  test("every section belongs to exactly one page", () => {
    const hosted = settingsPages.flatMap((page) => [...page.sectionIds]);
    expect(new Set(hosted).size).toBe(hosted.length);
    expect([...hosted].sort()).toEqual(settingsSections.map((section) => section.id).sort());
    for (const section of settingsSections) {
      const page = settingsPages.find((candidate) => getSettingsPageId(section.id) === candidate.id);
      expect(page?.sectionIds as readonly string[]).toContain(section.id);
    }
  });

  test("every page sits in exactly one sidebar group", () => {
    const grouped = settingsPageGroups.flatMap((group) => [...group.pageIds]);
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual(settingsPages.map((page) => page.id).sort());
  });

  test("groups pages into App, Projects, Agents and System", () => {
    const t = i18n.getFixedT("en");
    expect(
      settingsPageGroups.map((group) => [
        t(group.labelKey),
        group.pageIds.map((pageId) => {
          const page = settingsPages.find((candidate) => candidate.id === pageId)!;
          return [t(page.labelKey), [...page.sectionIds]];
        }),
      ]),
    ).toEqual([
      [
        "App",
        [
          ["General", ["general"]],
          ["Appearance", ["theme"]],
          ["Chat", ["chat"]],
          ["Editor & Terminal", ["editor", "terminal"]],
          ["Keyboard & Commands", ["commandPalette"]],
          ["Browser", ["lens", "mentions"]],
        ],
      ],
      ["Projects", [["Projects", ["projects", "scripts", "memory"]]]],
      [
        "Agents",
        [
          ["Accounts", ["accounts", "tooling"]],
          ["Providers", ["providers"]],
          ["Models", ["models", "autoRouting", "auxiliaryInference"]],
          ["Presets & Macros", ["presets", "macros"]],
          ["Prompts & Skills", ["prompts", "skills"]],
          ["MCP", ["mcp"]],
          ["Integrations", ["integrations", "issues", "kickoff"]],
          ["Secrets", ["secrets"]],
        ],
      ],
      ["System", [["Developer", ["developer"]], ["Changelog", ["changelog"]]]],
    ]);
  });

  test("page labels have Korean copy", () => {
    const ko = i18n.getFixedT("ko");
    expect(settingsPageGroups.map((group) => ko(group.labelKey))).toEqual([
      "앱",
      "프로젝트",
      "에이전트",
      "시스템",
    ]);
    for (const page of settingsPages) {
      expect(ko(page.labelKey)).not.toBe(page.labelKey);
    }
  });

  test("a merged section resolves to its host page and tab", () => {
    expect(getSettingsPageId("autoRouting")).toBe("models");
    expect(getSettingsPageId("tooling")).toBe("accounts");
    expect(getSettingsPageId("memory")).toBe("projects");
    expect(listVisibleSettingsPageSections("models", HIDDEN_DEVELOPER)).toEqual([
      "models",
      "autoRouting",
      "auxiliaryInference",
    ]);
    expect(resolveSettingsPageSection("projects", HIDDEN_DEVELOPER)).toBe("projects");
    expect(resolveSettingsPageSection("integrations", HIDDEN_DEVELOPER)).toBe("integrations");
  });

  test("the Developer page shows only in Developer mode", () => {
    expect(listVisibleSettingsPages(HIDDEN_DEVELOPER).map((page) => page.id)).not.toContain("developer");
    expect(listVisibleSettingsPages(SHOWN_DEVELOPER).map((page) => page.id)).toContain("developer");
    expect(listVisibleSettingsPages(HIDDEN_DEVELOPER)).toHaveLength(settingsPages.length - 1);
    expect(listVisibleSettingsPageSections("developer", HIDDEN_DEVELOPER)).toEqual([]);
    expect(resolveSettingsPageSection("developer", HIDDEN_DEVELOPER)).toBe("general");
    expect(resolveSettingsPageSection("developer", SHOWN_DEVELOPER)).toBe("developer");
  });
});
