import { expect, test, type Page } from "@playwright/test";

/**
 * The Memory section of the information-rows preview: ten memories (past the
 * filter threshold), three of them from a task that still exists.
 */
function memory(page: Page) {
  const section = page.locator("section").filter({ has: page.locator("[data-memory-filters], [data-memory-meta-provenance]") });
  return {
    section,
    rows: section.locator("article"),
    filters: section.locator("[data-memory-filters]"),
    chips: section.getByRole("radiogroup"),
    status: section.locator('[data-memory-filter-status] [role="status"]'),
  };
}

async function open(page: Page, args: { lang?: "en" | "ko"; dark?: boolean; width?: number; extra?: string } = {}) {
  const params = new URLSearchParams({ stavePreview: "information-rows" });
  if (args.lang) params.set("lang", args.lang);
  if (args.dark) params.set("theme", "dark");
  await page.goto(`/?${params.toString()}${args.extra ?? ""}`);
  if (args.width) {
    await page.locator("[data-review-information-rail]").evaluate((element, width) => {
      element.style.inlineSize = `${width}px`;
    }, args.width);
  }
  await page.evaluate(() => document.fonts.ready);
}

for (const lang of ["en", "ko"] as const) {
  for (const dark of [false, true]) {
    for (const width of [300, 340, 420]) {
      test(`memory chips and meta lines align and wrap inside the rail (${lang}, ${dark ? "dark" : "light"}, ${width}px)`, async ({ page }) => {
        await open(page, { lang, dark, width });
        const { section, rows, chips } = memory(page);
        await expect(rows).toHaveCount(10);
        await expect(chips.getByRole("radio")).toHaveCount(5);

        const geometry = await section.evaluate((root) => {
          const box = (element: Element | null) => {
            const rect = element!.getBoundingClientRect();
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
          };
          const filtersElement = root.querySelector("[data-memory-filters]")!;
          const group = filtersElement.querySelector('[role="radiogroup"]')!;
          const radios = [...group.querySelectorAll('[role="radio"]')];
          const hint = filtersElement.previousElementSibling;
          return {
            filters: box(filtersElement),
            hint: box(hint),
            search: box(filtersElement.firstElementChild),
            group: box(group),
            groupOverflows: group.scrollWidth > group.clientWidth + 0.5,
            radios: radios.map((radio) => ({ ...box(radio), clipped: radio.scrollWidth > radio.clientWidth + 0.5 })),
            rows: [...root.querySelectorAll("article")].map((article) => {
              const body = article.children[1]!;
              const [content, kindLine, provenance] = [...body.children];
              const parts = [...provenance!.children].map((child) => box(child));
              return {
                body: box(body),
                content: box(content!),
                kindLine: box(kindLine!),
                provenance: box(provenance!),
                provenanceOverflows: provenance!.scrollWidth > provenance!.clientWidth + 0.5,
                parts,
              };
            }),
          };
        });

        // The search and the chip track start where the hint above them starts
        // and never reach past the section.
        expect(Math.abs(geometry.search.left - geometry.hint.left)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(geometry.group.left - geometry.hint.left)).toBeLessThanOrEqual(0.5);
        expect(geometry.search.right).toBeLessThanOrEqual(geometry.filters.right + 0.5);
        expect(geometry.group.right).toBeLessThanOrEqual(geometry.filters.right + 0.5);
        expect(geometry.groupOverflows).toBe(false);
        // Chips wrap onto another track line rather than clipping a label.
        for (const radio of geometry.radios) {
          expect(radio.height).toBe(28);
          expect(radio.left).toBeGreaterThanOrEqual(geometry.group.left - 0.5);
          expect(radio.right).toBeLessThanOrEqual(geometry.group.right + 0.5);
          expect(radio.clipped).toBe(false);
        }
        // A wrapped track starts each line at the same edge.
        const lineStarts = new Map<number, number>();
        for (const radio of geometry.radios) {
          const line = Math.round(radio.top);
          lineStarts.set(line, Math.min(lineStarts.get(line) ?? Infinity, radio.left));
        }
        const starts = [...lineStarts.values()];
        expect(Math.max(...starts) - Math.min(...starts)).toBeLessThanOrEqual(0.5);

        for (const row of geometry.rows) {
          // The provenance line hangs from the same edge as the memory text and
          // its kind line, under them, inside the row body.
          expect(Math.abs(row.provenance.left - row.content.left)).toBeLessThanOrEqual(0.5);
          expect(Math.abs(row.provenance.left - row.kindLine.left)).toBeLessThanOrEqual(0.5);
          expect(row.provenance.top).toBeGreaterThanOrEqual(row.kindLine.bottom - 0.5);
          expect(row.provenance.right).toBeLessThanOrEqual(row.body.right + 0.5);
          expect(row.provenanceOverflows).toBe(false);
          // Time and source link share a centre line when they share a line.
          const [time, link] = row.parts;
          expect(time!.left).toBeGreaterThanOrEqual(row.provenance.left - 0.5);
          if (link && Math.abs(link.top - time!.top) < time!.height) {
            expect(Math.abs((link.top + link.bottom) / 2 - (time!.top + time!.bottom) / 2)).toBeLessThanOrEqual(1);
            expect(link.left).toBeGreaterThan(time!.right);
          }
        }
        expect(geometry.rows.filter((row) => row.parts.length === 2)).toHaveLength(3);
      });
    }
  }
}

test("search and kind chips narrow the list, and say how many match", async ({ page }) => {
  await open(page);
  const { section, rows, chips, status } = memory(page);
  const input = section.getByRole("textbox", { name: "Search memory" });
  await expect(input).toBeVisible();

  await input.fill("bun");
  await expect(rows).toHaveCount(2);
  await expect(status).toHaveText("2 of 10 memories match");
  await expect(rows.first().locator("mark").first()).toHaveText(/bun/i);

  await input.fill("");
  await chips.getByRole("radio", { name: /Gotcha/ }).click();
  await expect(rows).toHaveCount(3);
  await expect(status).toHaveText("3 of 10 memories match");
  // Pressing a chip leaves the keyboard where it was.
  await expect(chips.getByRole("radio", { name: /Gotcha/ })).toHaveAttribute("aria-checked", "true");

  await input.fill("zzz");
  await expect(rows).toHaveCount(0);
  await expect(status).toHaveText("No memories match these filters.");
  await section.getByRole("button", { name: "Clear filters" }).click();
  await expect(input).toHaveValue("");
  await expect(rows).toHaveCount(10);
  await expect(chips.getByRole("radio", { name: /All/ })).toHaveAttribute("aria-checked", "true");
});

test("forgetting asks nothing and Undo brings the memory back", async ({ page }) => {
  await open(page);
  const { section, rows } = memory(page);
  const target = rows.filter({ hasText: "Settings dialog sections remount" });
  await expect(target).toHaveCount(1);
  await target.hover();
  await target.getByRole("button", { name: /Forget memory:/ }).click();

  // No confirmation first: the row goes at once and the only dialog is the toast.
  await expect(target).toHaveCount(0);
  await expect(rows).toHaveCount(9);
  const toast = page.getByRole("dialog").filter({ hasText: "Memory forgotten" });
  await expect(toast).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(toast).toContainText("Settings dialog sections remount");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(target).toHaveCount(1);
  await expect(rows).toHaveCount(10);
  await expect(section.getByRole("radio", { name: /Gotcha/ })).toContainText("3");
});

test("forgetting from the keyboard keeps focus in the list, on the next row", async ({ page }) => {
  await open(page);
  const { rows } = memory(page);
  const target = rows.filter({ hasText: "Toasts: one top-center host" });
  const next = rows.filter({ hasText: "One provider reports context usage" });
  await target.getByRole("button", { name: /Forget memory:/ }).focus();
  await page.keyboard.press("Enter");
  await expect(target).toHaveCount(0);
  // The next row is a candidate, so its first action is "start using".
  await expect(next.getByRole("button", { name: /Start using this memory/ })).toBeFocused();
});

test("a short list shows no search and no chips", async ({ page }) => {
  await open(page, { extra: "&memories=few" });
  const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "Memory", exact: true }) });
  await expect(section.locator("article")).toHaveCount(3);
  await expect(section.locator("[data-memory-filters]")).toHaveCount(0);
  await expect(section.getByRole("radiogroup")).toHaveCount(0);
});
