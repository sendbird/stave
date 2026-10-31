import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getSettingsPageId } from "@/components/layout/settings-dialog.pages";
import { resolveSettingsSearch } from "@/components/layout/settings-search";
import { SettingsSearchResults } from "@/components/layout/settings-search-results";

const HIDDEN_DEVELOPER = { developerModeEnabled: false };

function renderResults(query: string, includePages: boolean) {
  return renderToStaticMarkup(
    createElement(SettingsSearchResults, {
      search: resolveSettingsSearch(query, HIDDEN_DEVELOPER),
      includePages,
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

  test("a field result opens its host page on the tab that owns it", () => {
    const search = resolveSettingsSearch("auto routing profile", HIDDEN_DEVELOPER);
    const field = search.fields.find((candidate) => candidate.key === "autoRoutingProfile");
    expect(field?.sectionId).toBe("autoRouting");
    expect(getSettingsPageId(field!.sectionId)).toBe("models");
    expect(search.groups.flatMap((group) => group.pages)).toContainEqual({
      pageId: "models",
      sectionId: "autoRouting",
    });
  });

  test("settings are grouped by page in sidebar order", () => {
    const search = resolveSettingsSearch("model", HIDDEN_DEVELOPER);
    const pageOrder = search.groups.flatMap((group) => group.pages.map((page) => page.pageId));
    const fieldPages = search.fields.map((field) => getSettingsPageId(field.sectionId));
    expect(fieldPages.length).toBeGreaterThan(1);
    const positions = fieldPages.map((pageId) => pageOrder.indexOf(pageId));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  test("a page that matches by name is one result, opening its first matching tab", () => {
    const search = resolveSettingsSearch("editor", HIDDEN_DEVELOPER);
    expect(search.fields).toEqual([]);
    expect(search.pages).toEqual([{ pageId: "editorTerminal", sectionId: "editor" }]);
    expect(search.groups.flatMap((group) => group.pages)).toEqual([
      { pageId: "editorTerminal", sectionId: "editor" },
    ]);
    expect(search.empty).toBe(false);

    // Both tabs of a merged page match; the page is still a single row.
    const merged = resolveSettingsSearch("font", HIDDEN_DEVELOPER);
    expect(merged.pages.filter((page) => page.pageId === "editorTerminal")).toEqual([
      { pageId: "editorTerminal", sectionId: "editor" },
    ]);

    // A tab that matches on its own opens that tab, not the first one.
    expect(resolveSettingsSearch("hotkeys", HIDDEN_DEVELOPER).pages).toEqual([
      { pageId: "keyboard", sectionId: "commandPalette" },
    ]);
    expect(resolveSettingsSearch("lens", HIDDEN_DEVELOPER).pages).toContainEqual({
      pageId: "browser",
      sectionId: "lens",
    });
    expect(resolveSettingsSearch("tickets", HIDDEN_DEVELOPER).pages).toEqual([
      { pageId: "integrations", sectionId: "issues" },
    ]);
  });

  test("a query nothing answers is empty", () => {
    const search = resolveSettingsSearch("zzqx", HIDDEN_DEVELOPER);
    expect(search).toMatchObject({ fields: [], pages: [], groups: [], scopeMatches: false, empty: true });
  });

  test("no query keeps every visible page and lists no results", () => {
    const search = resolveSettingsSearch("   ", HIDDEN_DEVELOPER);
    expect(search.query).toBe("");
    expect(search.pages).toEqual([]);
    const pages = search.groups.flatMap((group) => group.pages);
    expect(pages.map((page) => page.pageId)).not.toContain("developer");
    expect(pages).toContainEqual({ pageId: "projects", sectionId: "projects" });
    expect(pages).toContainEqual({ pageId: "models", sectionId: "models" });
    expect(search.empty).toBe(false);
  });

  test("a page the profile hides is never a result", () => {
    expect(resolveSettingsSearch("developer", HIDDEN_DEVELOPER).pages.map((page) => page.pageId)).not.toContain("developer");
    expect(
      resolveSettingsSearch("developer", { developerModeEnabled: true }).pages.map((page) => page.pageId),
    ).toContain("developer");
  });
});

describe("SettingsSearchResults", () => {
  test("lists a matching setting with the page it opens", () => {
    const html = renderResults("usage limit", false);
    expect(html).toContain("Search results");
    expect(html).toContain("Stop turns at 100% usage");
    expect(html).toContain("Providers");
  });

  test("the narrow layout lists a page that matches by name, naming the tab it opens; the sidebar leaves it to its page list", () => {
    const html = renderResults("editor", true);
    expect(html).toContain(">Editor &amp; Terminal<");
    expect(html).toContain(">Editor<");
    expect(html.match(/<li/g)).toHaveLength(1);
    expect(renderResults("editor", false)).toBe("");
  });

  test("a setting on a merged page names the page", () => {
    const html = renderResults("auto routing profile", false);
    expect(html).toContain("Auto routing profile");
    expect(html).toContain("Models");
  });

  test("says when nothing matches, in both layouts", () => {
    for (const includePages of [true, false]) {
      const html = renderResults("zzqx", includePages);
      expect(html).toContain('role="status"');
      expect(html).toContain("No settings match");
      expect(html).toContain("zzqx");
    }
  });

  test("renders nothing before the user types", () => {
    expect(renderResults("", true)).toBe("");
  });
});
