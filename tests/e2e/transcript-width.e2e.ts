import { expect, test, type Page } from "@playwright/test";
import { TRANSCRIPT_OVERFLOW_REPLY } from "../../src/dev/fixtures/transcript-overflow-fixture";

/**
 * The conversation width scale and the column's containment, in the task chat
 * and in Tars, measured in a real browser.
 *
 * - The column and the composer take one step of the width scale, chosen by
 *   the conversation surface's own width and the reader's conversation width
 *   setting (`transcript-width.ts`).
 * - Nothing in a reply ends past the column's edges — code blocks and fences
 *   in lists and quotes, long links, unbroken tokens, small tables, cards —
 *   except a table whose columns need more room. That table grows
 *   symmetrically on the column's axis, never past the transcript's gutters,
 *   and nothing makes the transcript scroll sideways.
 */

const REM = 16;
const STEPS = {
  narrow: [44, 46, 48],
  default: [48, 52, 56],
  wide: [56, 64, 72],
} as const;
type Width = keyof typeof STEPS;

/** The column cap for a surface this wide: the steps start at 64rem and 90rem. */
function capFor(surfaceWidth: number, width: Width) {
  const [small, regular, large] = STEPS[width];
  return (surfaceWidth >= 90 * REM ? large : surfaceWidth >= 64 * REM ? regular : small) * REM;
}

async function seedTask(page: Page, options: { conversationWidth?: Width; lang?: "en" | "ko"; dark?: boolean } = {}) {
  await page.addInitScript(
    ({ reply, conversationWidth, lang, dark }) => {
      const taskId = "task-transcript-width";
      const workspaceId = "ws-main";
      const messages = [
        { id: "u1", role: "user", model: "", providerId: "user", content: "Show me every wide block.", parts: [{ type: "text", text: "Show me every wide block." }] },
        { id: "a1", role: "assistant", model: "claude-sonnet-4-5", providerId: "claude-code", content: "", parts: [{ type: "text", text: reply }] },
      ];
      const snapshot = {
        activeTaskId: taskId,
        openTaskTabIds: [taskId],
        activeSurface: { kind: "task", taskId },
        tasks: [{ id: taskId, title: "Transcript width", provider: "claude-code", updatedAt: "2026-07-25T00:00:00.000Z", unread: false, archivedAt: null }],
        messagesByTask: { [taskId]: messages },
      };
      (window as unknown as { api?: Record<string, unknown> }).api = {
        provider: { streamTurn: async () => [], getCodexModelCatalog: async () => ({ ok: true, models: [], detail: "" }) },
        terminal: { runCommand: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }) },
      };
      window.localStorage.setItem(
        "stave:workspace-fallback:v1",
        JSON.stringify([{ id: workspaceId, name: "main", updatedAt: "2026-07-25T00:00:00.000Z", snapshot }]),
      );
      window.localStorage.setItem(
        "stave-store",
        JSON.stringify({
          state: {
            repositoryPath: "/tmp/stave-project",
            repositoryName: "stave-project",
            workspaces: [{ id: workspaceId, name: "main", updatedAt: "2026-07-25T00:00:00.000Z" }],
            activeWorkspaceId: workspaceId,
            workspaceBranchById: { [workspaceId]: "main" },
            workspacePathById: { [workspaceId]: "/tmp/stave-project" },
            workspaceDefaultById: { [workspaceId]: true },
            isDarkMode: dark,
            settings: { reasoningExpansionMode: "manual", language: lang, themeMode: dark ? "dark" : "light", conversationWidth },
            ...snapshot,
          },
          version: 0,
        }),
      );
    },
    { reply: TRANSCRIPT_OVERFLOW_REPLY, conversationWidth: options.conversationWidth ?? "default", lang: options.lang ?? "en", dark: Boolean(options.dark) },
  );
}

async function openTask(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-message-id="a1"]')).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
}

interface Containment {
  /** The column: the list's content box, where every row ends. */
  column: { left: number; right: number };
  /** The width of the surface the scale steps on. */
  surface: number;
  composer: { left: number; right: number } | null;
  /** Elements in the reply that end past the column without being a wide table. */
  offenders: string[];
  /** Each wide table's box, the column's axis and the gutter-bound limit. */
  wide: Array<{ left: number; right: number }>;
  gutters: { left: number; right: number };
  sideways: number;
  /** Top-level code blocks and the small table: their left and right edges. */
  inColumn: Array<{ left: number; right: number }>;
}

/** Everything the containment contract reads, from one reply in one transcript. */
async function measure(page: Page, replySelector: string, surfaceSelector: string, composerSelector: string): Promise<Containment> {
  return page.evaluate(({ replySelector, surfaceSelector, composerSelector }) => {
    const reply = document.querySelector<HTMLElement>(replySelector)!;
    let list: HTMLElement = reply;
    while (getComputedStyle(list).maxWidth === "none") list = list.parentElement!;
    const listStyle = getComputedStyle(list);
    const listBox = list.getBoundingClientRect();
    const column = { left: listBox.left + parseFloat(listStyle.paddingLeft), right: listBox.right - parseFloat(listStyle.paddingRight) };
    let scroller: HTMLElement = reply;
    while (!["auto", "scroll"].includes(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement!;
    const scrollerBox = scroller.getBoundingClientRect();
    const offenders: string[] = [];
    for (const element of reply.querySelectorAll<HTMLElement>("*")) {
      const box = element.getBoundingClientRect();
      if (box.width <= 1 || box.height <= 1 || getComputedStyle(element).clipPath.startsWith("inset(50%")) continue;
      if (element.closest("[data-transcript-wide]")) continue;
      // Content inside a box that clips or scrolls is bounded by that box, which is checked itself.
      let clipped = false;
      for (let parent = element.parentElement; parent && parent !== reply; parent = parent.parentElement) {
        if (getComputedStyle(parent).overflowX !== "visible") { clipped = true; break; }
      }
      if (clipped) continue;
      if (box.left < column.left - 1 || box.right > column.right + 1) {
        offenders.push(`${element.tagName.toLowerCase()} "${(element.textContent ?? "").slice(0, 40)}" ${Math.round(box.left - column.left)}/${Math.round(box.right - column.right)}`);
      }
    }
    const wide = [...reply.querySelectorAll("[data-transcript-wide] > *")].map((element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right };
    });
    const inColumn = [...reply.querySelectorAll<HTMLElement>(":scope pre, :scope table")]
      .filter((element) => !element.closest("li, blockquote"))
      .filter((element) => element.tagName === "PRE" || element.querySelectorAll("th").length <= 2)
      .map((element) => {
        // The block's own frame: the code block's body or the table's scroll box.
        const frame = element.tagName === "PRE" ? element.parentElement! : element.closest<HTMLElement>("[data-slot=table-container]")!;
        const box = frame.getBoundingClientRect();
        return { left: box.left, right: box.right };
      });
    const composer = document.querySelector(composerSelector)?.getBoundingClientRect() ?? null;
    return {
      column,
      surface: document.querySelector(surfaceSelector)!.getBoundingClientRect().width,
      composer: composer && { left: composer.left, right: composer.right },
      offenders,
      wide,
      gutters: { left: scrollerBox.left + 20, right: scrollerBox.right - 20 },
      sideways: scroller.scrollWidth - scroller.clientWidth + (document.documentElement.scrollWidth - document.documentElement.clientWidth),
      inColumn,
    };
  }, { replySelector, surfaceSelector, composerSelector });
}

function expectContained(geometry: Containment) {
  expect(geometry.offenders).toEqual([]);
  expect(geometry.sideways).toBeLessThanOrEqual(0);
  for (const block of geometry.inColumn) {
    expect(Math.abs(block.left - geometry.column.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(block.right - geometry.column.right)).toBeLessThanOrEqual(1);
  }
  const axis = (geometry.column.left + geometry.column.right) / 2;
  for (const block of geometry.wide) {
    // Never narrower than the column, centred on its axis, inside the gutters.
    expect(block.right - block.left).toBeGreaterThanOrEqual(geometry.column.right - geometry.column.left - 1);
    expect(Math.abs((block.left + block.right) / 2 - axis)).toBeLessThanOrEqual(1);
    expect(block.left).toBeGreaterThanOrEqual(Math.min(geometry.column.left, geometry.gutters.left) - 1);
    expect(block.right).toBeLessThanOrEqual(Math.max(geometry.column.right, geometry.gutters.right) + 1);
  }
}

test.describe("transcript width", () => {
  test.setTimeout(120_000);

  for (const width of [390, 768, 1280, 1440, 1920]) {
    test(`the task chat's column and composer take their width step and contain every block at ${width}px`, async ({ page }) => {
      await seedTask(page);
      await openTask(page, width);
      const geometry = await measure(page, '[data-message-id="a1"] article > div', '[data-testid="session-area"]', ".prompt-input-shell");
      const columnWidth = geometry.column.right - geometry.column.left;
      // The column is the step's cap, or the room the surface has below it.
      expect(columnWidth).toBeLessThanOrEqual(capFor(geometry.surface, "default") + 0.5);
      if (geometry.surface - 2 * 20 > capFor(geometry.surface, "default")) {
        expect(Math.abs(columnWidth - capFor(geometry.surface, "default"))).toBeLessThanOrEqual(0.5);
      }
      // The composer's card sits on the same axis.
      expect(geometry.composer).not.toBeNull();
      expect(Math.abs((geometry.composer!.left + geometry.composer!.right) / 2 - (geometry.column.left + geometry.column.right) / 2)).toBeLessThanOrEqual(2);
      expectContained(geometry);
      // With room, the table that needs it grows past the column; the small one never does.
      if (width >= 1280) expect(geometry.wide.some((block) => block.right - block.left > columnWidth + 2)).toBe(true);
    });
  }

  test("the conversation width setting picks the scale, in Korean and dark too", async ({ page }) => {
    for (const conversationWidth of ["narrow", "wide"] as const) {
      await seedTask(page, { conversationWidth, lang: "ko", dark: true });
      await openTask(page, 1920);
      const geometry = await measure(page, '[data-message-id="a1"] article > div', '[data-testid="session-area"]', ".prompt-input-shell");
      const columnWidth = geometry.column.right - geometry.column.left;
      const cap = capFor(geometry.surface, conversationWidth);
      expect(columnWidth).toBeLessThanOrEqual(cap + 0.5);
      expect(Math.abs(columnWidth - Math.min(cap, geometry.surface - 2 * 20))).toBeLessThanOrEqual(0.5);
      expectContained(geometry);
    }
  });

  for (const width of [390, 1440]) {
    test(`Tars's column and composer take their width step and contain every block at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/?stavePreview=tars&overflowReply=true");
      const editor = page.locator("[data-tars-composer]").getByRole("textbox");
      await editor.fill("Show me every wide block.");
      await editor.press("Enter");
      await expect(page.locator("[data-tars-reply]")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const geometry = await measure(page, "[data-tars-reply]", "[data-tars-chat]", "[data-tars-composer] > div");
      const columnWidth = geometry.column.right - geometry.column.left;
      expect(columnWidth).toBeLessThanOrEqual(capFor(geometry.surface, "default") + 0.5);
      if (width >= 1280) expect(Math.abs(columnWidth - capFor(geometry.surface, "default"))).toBeLessThanOrEqual(0.5);
      expect(Math.abs(geometry.composer!.left - geometry.column.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(geometry.composer!.right - geometry.column.right)).toBeLessThanOrEqual(1);
      expectContained(geometry);
    });
  }

  test("Tars's cards, records and flows stay inside the column at narrow and wide widths", async ({ page }) => {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/?stavePreview=tars&gallery=true&lang=ko");
      await expect(page.locator("[data-tars-message]").first()).toBeVisible({ timeout: 60_000 });
      await page.evaluate(() => document.fonts.ready);
      const result = await page.evaluate(() => {
        let list = document.querySelector<HTMLElement>("[data-tars-message]")!;
        while (getComputedStyle(list).maxWidth === "none") list = list.parentElement!;
        const style = getComputedStyle(list);
        const box = list.getBoundingClientRect();
        const left = box.left + parseFloat(style.paddingLeft);
        const right = box.right - parseFloat(style.paddingRight);
        const offenders: string[] = [];
        for (const element of list.querySelectorAll<HTMLElement>("*")) {
          const rect = element.getBoundingClientRect();
          if (rect.width <= 1 || rect.height <= 1 || getComputedStyle(element).clipPath.startsWith("inset(50%") || element.closest("[data-transcript-wide]")) continue;
          let clipped = false;
          for (let parent = element.parentElement; parent && parent !== list; parent = parent.parentElement) {
            if (getComputedStyle(parent).overflowX !== "visible") { clipped = true; break; }
          }
          if (!clipped && (rect.left < left - 1 || rect.right > right + 1)) offenders.push(`${element.tagName} ${(element.textContent ?? "").slice(0, 40)}`);
        }
        let scroller: HTMLElement = list;
        while (!["auto", "scroll"].includes(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement!;
        return { offenders, sideways: scroller.scrollWidth - scroller.clientWidth };
      });
      expect(result.offenders).toEqual([]);
      expect(result.sideways).toBeLessThanOrEqual(0);
    }
  });
});
