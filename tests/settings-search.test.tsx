import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { resolveSettingsSearch } from "@/components/layout/settings-search";
import { SettingsSearchResults } from "@/components/layout/settings-search-results";

const HIDDEN_DEVELOPER = { developerModeEnabled: false };

function renderResults(query: string, includeSections: boolean) {
  return renderToStaticMarkup(
    createElement(SettingsSearchResults, {
      search: resolveSettingsSearch(query, HIDDEN_DEVELOPER),
      includeSections,
      onSelectScope: () => {},
      onSelectField: () => {},
      onSelectSection: () => {},
    }),
  );
}

describe("resolveSettingsSearch", () => {
  test("finds a setting that lives in another section", () => {
    const search = resolveSettingsSearch("  usage limit ", HIDDEN_DEVELOPER);
    expect(search.query).toBe("usage limit");
    expect(search.fields.map((field) => [field.key, field.sectionId])).toEqual([
      ["blockTurnsWhenAccountLimitReached", "providers"],
    ]);
    expect(search.empty).toBe(false);
  });

  test("a section that matches by name is a result even without a matching setting", () => {
    const search = resolveSettingsSearch("editor", HIDDEN_DEVELOPER);
    expect(search.fields).toEqual([]);
    expect(search.sections.map((section) => section.id)).toEqual(["editor"]);
    expect(search.groups.flatMap((group) => group.ids)).toEqual(["editor"]);
    expect(search.empty).toBe(false);
  });

  test("a query nothing answers is empty", () => {
    const search = resolveSettingsSearch("zzqx", HIDDEN_DEVELOPER);
    expect(search).toMatchObject({ fields: [], sections: [], groups: [], scopeMatches: false, empty: true });
  });

  test("no query keeps every visible group and lists no results", () => {
    const search = resolveSettingsSearch("   ", HIDDEN_DEVELOPER);
    expect(search.query).toBe("");
    expect(search.sections).toEqual([]);
    expect(search.groups.length).toBeGreaterThan(0);
    expect(search.groups.flatMap((group) => group.ids)).not.toContain("developer");
    expect(search.empty).toBe(false);
  });

  test("a section the profile hides is never a result", () => {
    expect(resolveSettingsSearch("developer", HIDDEN_DEVELOPER).sections.map((section) => section.id)).not.toContain("developer");
    expect(
      resolveSettingsSearch("developer", { developerModeEnabled: true }).sections.map((section) => section.id),
    ).toContain("developer");
  });
});

describe("SettingsSearchResults", () => {
  test("lists a matching setting with the section it opens", () => {
    const html = renderResults("usage limit", false);
    expect(html).toContain("Search results");
    expect(html).toContain("Stop turns at 100% usage");
    expect(html).toContain("Providers");
  });

  test("the narrow layout lists a section that matches by name; the sidebar leaves it to its section list", () => {
    expect(renderResults("editor", true)).toContain("Editor");
    expect(renderResults("editor", false)).toBe("");
  });

  test("says when nothing matches, in both layouts", () => {
    for (const includeSections of [true, false]) {
      const html = renderResults("zzqx", includeSections);
      expect(html).toContain('role="status"');
      expect(html).toContain("No settings match");
      expect(html).toContain("zzqx");
    }
  });

  test("renders nothing before the user types", () => {
    expect(renderResults("", true)).toBe("");
  });
});
