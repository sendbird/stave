import { expect, test, type Page } from "@playwright/test";
import { TRANSCRIPT_OVERFLOW_REPLY } from "../../src/dev/fixtures/transcript-overflow-fixture";

test.describe.configure({ timeout: 90_000 });

/** The scale for one chat font size (`chatTypeScale` + the caption/micro floors in `chatTypeScaleVars`). */
function scaleFor(body: number) {
  return { body, secondary: Math.max(12, Math.round(body * 14 / 16)), meta: Math.max(11, Math.round(body * 12 / 16)) };
}

async function openGallery(page: Page, query: string, width = 1440) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/?stavePreview=tars&gallery=true${query}`);
  await expect(page.locator('[data-tars-message="g-a1"]')).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
}

/**
 * Every text-bearing element of the surfaces this scale owns in the Tars
 * column: replies, user bubbles, status rows, failures, file chips, times,
 * the running strip and the composer's words. Headings step up from the scale
 * and code glyphs follow the code font size setting, so they are read apart;
 * AUI controls (a failure's Resend) keep their control type.
 */
async function ownedText(page: Page) {
  return page.evaluate(() => {
    const owned = [
      "[data-tars-reply]", "[data-tars-user-bubble]", "[data-tars-message-state]", "[data-tars-message-attachments]",
      "[data-tars-message-working-changes]", "[data-tars-message-time]", "[data-tars-running-strip]", "[data-tars-composer] [contenteditable]",
    ].join(", ");
    const roots = [...document.querySelectorAll<HTMLElement>(owned)];
    const nodes = new Set<HTMLElement>();
    for (const root of roots) for (const node of [root, ...root.querySelectorAll<HTMLElement>("*")]) nodes.add(node);
    const text: Array<{ size: number; lineHeight: string; what: string }> = [];
    const headings: Array<{ level: number; size: number }> = [];
    const code: number[] = [];
    for (const node of nodes) {
      if (![...node.childNodes].some((child) => child.nodeType === Node.TEXT_NODE && child.textContent!.trim()) || !node.checkVisibility()) continue;
      const style = getComputedStyle(node);
      const size = parseFloat(style.fontSize);
      const heading = node.closest("h1, h2, h3");
      if (heading) { headings.push({ level: Number(heading.tagName[1]), size }); continue; }
      if (node.closest("pre, code")) { code.push(size); continue; }
      const control = node.closest("button");
      if (control && !control.closest("[data-tars-message-time], [data-tars-running-toggle]")) continue;
      text.push({ size, lineHeight: style.lineHeight, what: `${node.tagName.toLowerCase()}:${node.textContent!.trim().slice(0, 24)}` });
    }
    return { text, headings, code };
  });
}

for (const { name, query } of [{ name: "en light", query: "" }, { name: "ko dark", query: "&lang=ko&theme=dark" }]) {
  for (const body of [12, 16, 24]) {
    test(`Tars surfaces read only the scale's three sizes at a ${body}px chat font size: ${name}`, async ({ page }) => {
      await openGallery(page, `${query}&messageFontSize=${body}`);
      const scale = scaleFor(body);
      const { text, headings, code } = await ownedText(page);
      const allowed = new Set([scale.body, scale.secondary, scale.meta]);
      expect(text.length).toBeGreaterThan(100);
      expect(text.filter((entry) => !allowed.has(entry.size)).map((entry) => `${entry.size}px ${entry.what}`)).toEqual([]);
      // Each step is in use, so the scale is the one that moved, not a fixed size that happens to match.
      for (const size of allowed) expect(text.some((entry) => entry.size === size)).toBe(true);
      // No text falls back to the browser's `normal` leading.
      expect(text.filter((entry) => entry.lineHeight === "normal").map((entry) => entry.what)).toEqual([]);
      // Headings step up from the body by a fixed ratio; code follows its own setting (14px by default).
      for (const heading of headings) expect(heading.size).toBeCloseTo(body * ({ 1: 1.5, 2: 1.25, 3: 1.125 } as Record<number, number>)[heading.level]!, 1);
      expect(headings.length).toBeGreaterThan(0);
      expect(new Set(code)).toEqual(new Set([14]));
      // A reply's paragraphs read on the body step at its 1.55 ratio.
      const paragraph = await page.locator("[data-tars-reply] p").first().evaluate((node) => {
        const style = getComputedStyle(node);
        return parseFloat(style.lineHeight) / parseFloat(style.fontSize);
      });
      expect(paragraph).toBeCloseTo(1.55, 2);
      // The composer's words are the body step too.
      expect(await page.locator("[data-tars-composer] [contenteditable]").evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBe(body);
    });
  }
}

test("code blocks: 4-column tabs, diff rows on the diff wash, readable language names", async ({ page }) => {
  await openGallery(page, "");
  const reply = page.locator('[data-tars-message="g-b4"]');
  await reply.scrollIntoViewIfNeeded();
  await expect.poll(() => reply.locator(".stave-code-block[data-diff-block]").count(), { timeout: 20_000 }).toBe(2);
  const result = await reply.evaluate((node) => {
    const probe = (color: string) => {
      const element = document.createElement("div");
      element.style.backgroundColor = color;
      node.append(element);
      const value = getComputedStyle(element).backgroundColor;
      element.remove();
      return value;
    };
    const blocks = [...node.querySelectorAll<HTMLElement>("[data-code-block]")];
    const go = blocks.find((block) => block.textContent!.includes("func RetryDelay"))!.querySelector("pre")!;
    const diff = node.querySelector<HTMLElement>(".stave-code-block[data-diff-block]")!;
    const lines = [...diff.querySelectorAll<HTMLElement>(".line")];
    return {
      tab: getComputedStyle(go).tabSize,
      // One tab is four spaces wide: the tab line's indent equals four space characters.
      labels: blocks.map((block) => block.querySelector("[data-code-block] > div span")?.textContent),
      added: probe("var(--aui-color-diff-added)"), removed: probe("var(--aui-color-diff-removed)"),
      rows: lines.map((line) => ({ kind: line.dataset.diff ?? "", background: getComputedStyle(line).backgroundColor,
        width: line.getBoundingClientRect().width })),
      inner: diff.clientWidth,
    };
  });
  expect(result.tab).toBe("4");
  expect(result.labels).toEqual(expect.arrayContaining(["TypeScript", "JSON", "JSONC", "Bash", "Shell", "Go", "Diff", "Patch", "YAML", "Markdown"]));
  const added = result.rows.filter((row) => row.kind === "add");
  const removed = result.rows.filter((row) => row.kind === "remove");
  expect(added.length).toBeGreaterThan(0);
  expect(removed.length).toBeGreaterThan(0);
  for (const row of added) expect(row.background).toBe(result.added);
  for (const row of removed) expect(row.background).toBe(result.removed);
  // Context and header lines keep the code surface; every row spans the block.
  for (const row of result.rows.filter((row) => !row.kind)) expect(row.background).toBe("rgba(0, 0, 0, 0)");
  for (const row of result.rows) expect(row.width).toBeGreaterThanOrEqual(result.inner - 1);
  // The tab renders four columns wide, not eight: the first word after it starts four characters in.
  const indent = await reply.locator("[data-code-block]", { hasText: /func RetryDelay/ }).locator(".line").nth(1).evaluate((line) => {
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    let text = walker.nextNode() as Text;
    while (!text.data.includes("\t")) text = walker.nextNode() as Text;
    const at = (offset: number) => {
      const range = document.createRange();
      range.setStart(text, offset);
      range.setEnd(text, offset + 1);
      return range.getBoundingClientRect();
    };
    const lead = text.data.indexOf("\t");
    // The first character after the tab, wherever the highlighter split the line.
    let next = lead + 1 < text.data.length ? at(lead + 1) : null;
    if (!next) {
      const following = walker.nextNode() as Text;
      const range = document.createRange();
      range.setStart(following, 0);
      range.setEnd(following, 1);
      next = range.getBoundingClientRect();
    }
    return { offset: next.left - at(lead).left, char: next.width };
  });
  expect(indent.offset).toBeCloseTo(indent.char * 4, 0);
});

test("a long code line fades at the edge it continues past, and the keyboard reaches and scrolls it", async ({ page }) => {
  await openGallery(page, "");
  const block = page.locator('[data-tars-message="g-b3"] [data-code-block]').first();
  await block.scrollIntoViewIfNeeded();
  const pre = block.locator("pre");
  await expect(pre).toHaveAttribute("data-scroll-fade", "end");
  await expect(pre).toHaveAttribute("tabindex", "0");
  await expect(pre).toHaveAttribute("role", "region");
  await expect(pre).toHaveAccessibleName("Code, scrolls sideways");
  // Tab from the block's copy button lands on the code, and its block shows the focus ring.
  await block.getByRole("button").first().focus();
  await page.keyboard.press("Tab");
  await expect(pre).toBeFocused();
  expect(await block.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe("solid");
  await page.keyboard.press("End");
  for (let index = 0; index < 20; index += 1) await page.keyboard.press("ArrowRight");
  await expect.poll(() => pre.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  await expect(pre).not.toHaveAttribute("data-scroll-fade", "end");
  // A block that fits takes no tab stop and no fade.
  const fits = page.locator('[data-tars-message="g-b1"] [data-code-block] pre').first();
  await expect(fits).not.toHaveAttribute("tabindex", /.*/);
  await expect(fits).not.toHaveAttribute("data-scroll-fade", /.*/);
});

for (const { name, query } of [{ name: "en light", query: "" }, { name: "ko dark", query: "&lang=ko&theme=dark" }]) {
  test(`the running strip folds to one line and unfolds with the keyboard: ${name}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/?stavePreview=tars&tray=true&live=true${query}`);
    const strip = page.locator("[data-tars-running-strip]");
    const toggle = strip.locator("[data-tars-running-toggle]");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveAccessibleName(query ? "지금 1개 실행 중" : "1 running now");
    await expect(strip.locator("[data-tars-running]")).toBeHidden();
    await page.evaluate(() => document.fonts.ready);
    // One line: the summary is the AUI small control height, nothing under it.
    const folded = await strip.evaluate((node) => node.getBoundingClientRect().height);
    expect(folded).toBeLessThanOrEqual(32 + 1);
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(strip.locator("[data-tars-running]")).toBeVisible();
    // The rows keep their controls and names, and the keyboard reaches them next.
    await page.keyboard.press("Tab");
    await expect(strip.locator("[data-tars-running-timeline]")).toBeFocused();
    await toggle.focus();
    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(strip.locator("[data-tars-running]")).toBeHidden();
  });
}

test("a folded strip names work that has gone quiet", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?stavePreview=tars&tray=true&live=stale");
  const toggle = page.locator("[data-tars-running-toggle]");
  await expect(toggle.locator("[data-tars-running-stale]")).toHaveText("1 not updated recently");
  await expect(toggle).toHaveAccessibleName("1 running now, 1 not updated recently");
});

test("the message time has a 24px hit area above its line and moves nothing", async ({ page }) => {
  await openGallery(page, "");
  const exchange = page.locator('[data-tars-message="g-a4"]');
  await exchange.evaluate((node) => node.scrollIntoView({ block: "center" }));
  const hit = await exchange.evaluate((node) => {
    const button = node.querySelector<HTMLElement>("[data-tars-message-time] button")!;
    const box = button.getBoundingClientRect();
    const x = box.left + box.width / 2;
    return {
      lineHeight: getComputedStyle(button).lineHeight,
      // 24px tall from the button's bottom edge up; nothing below it.
      top: document.elementFromPoint(x, box.bottom - 23)?.closest("button") === button,
      below: document.elementFromPoint(x, box.bottom + 2)?.closest("button") === button,
    };
  });
  expect(hit.lineHeight).not.toBe("normal");
  expect(hit.top).toBe(true);
  expect(hit.below).toBe(false);
});

/** Where the scroll-to-bottom button sits against the composer, once the reader scrolls up. */
async function scrollButtonPlacement(page: Page, scrollerOf: string, composer: string) {
  await page.evaluate((selector) => {
    let node: HTMLElement | null = document.querySelector<HTMLElement>(selector);
    while (node && !(node.scrollHeight > node.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(node).overflowY))) node = node.parentElement;
    node!.scrollTop = 0;
    node!.dispatchEvent(new Event("scroll"));
  }, scrollerOf);
  const button = page.getByRole("button", { name: /Scroll to bottom|맨 아래로/ }).first();
  await expect(button).toBeVisible();
  return page.evaluate(({ composer }) => {
    const button = [...document.querySelectorAll<HTMLElement>("button")].find((node) => /Scroll to bottom|맨 아래로/.test(node.getAttribute("aria-label") ?? ""))!;
    const box = button.getBoundingClientRect();
    const field = document.querySelector<HTMLElement>(composer)!.getBoundingClientRect();
    return { center: box.left + box.width / 2, composerCenter: field.left + field.width / 2, bottom: box.bottom, composerTop: field.top };
  }, { composer });
}

test("the scroll-to-bottom button sits centred above the Tars composer", async ({ page }) => {
  for (const width of [390, 1440]) {
    await openGallery(page, "", width);
    const placement = await scrollButtonPlacement(page, '[data-testid="tars-transcript"]', "[data-tars-composer] form");
    expect(Math.abs(placement.center - placement.composerCenter)).toBeLessThanOrEqual(1);
    expect(placement.bottom).toBeLessThanOrEqual(placement.composerTop);
  }
});

test("the scroll-to-bottom button sits centred above the task composer", async ({ page }) => {
  await page.addInitScript((reply) => {
    const taskId = "task-type-scale";
    const workspaceId = "ws-main";
    const messages = [
      { id: "u1", role: "user", model: "", providerId: "user", content: "Show me every wide block.", parts: [{ type: "text", text: "Show me every wide block." }] },
      { id: "a1", role: "assistant", model: "claude-sonnet-4-5", providerId: "claude-code", content: "", parts: [{ type: "text", text: reply }] },
    ];
    const snapshot = {
      activeTaskId: taskId, openTaskTabIds: [taskId], activeSurface: { kind: "task", taskId },
      tasks: [{ id: taskId, title: "Type scale", provider: "claude-code", updatedAt: "2026-07-25T00:00:00.000Z", unread: false, archivedAt: null }],
      messagesByTask: { [taskId]: messages },
    };
    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: { streamTurn: async () => [], getCodexModelCatalog: async () => ({ ok: true, models: [], detail: "" }) },
      terminal: { runCommand: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }) },
    };
    window.localStorage.setItem("stave:workspace-fallback:v1", JSON.stringify([{ id: workspaceId, name: "main", updatedAt: "2026-07-25T00:00:00.000Z", snapshot }]));
    window.localStorage.setItem("stave-store", JSON.stringify({
      state: {
        repositoryPath: "/tmp/stave-project", repositoryName: "stave-project",
        workspaces: [{ id: workspaceId, name: "main", updatedAt: "2026-07-25T00:00:00.000Z" }], activeWorkspaceId: workspaceId,
        workspaceBranchById: { [workspaceId]: "main" }, workspacePathById: { [workspaceId]: "/tmp/stave-project" }, workspaceDefaultById: { [workspaceId]: true },
        settings: { reasoningExpansionMode: "manual", language: "en" }, ...snapshot,
      },
      version: 0,
    }));
  }, TRANSCRIPT_OVERFLOW_REPLY);
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-message-id="a1"]')).toBeVisible({ timeout: 60_000 });
  const placement = await scrollButtonPlacement(page, '[data-message-id="a1"]', "[data-prompt-input-root], form:has([contenteditable])");
  expect(Math.abs(placement.center - placement.composerCenter)).toBeLessThanOrEqual(1);
  expect(placement.bottom).toBeLessThanOrEqual(placement.composerTop);
});
