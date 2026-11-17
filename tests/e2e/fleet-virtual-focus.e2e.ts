import { expect, test, type Page } from "@playwright/test";
import {
  FLEET_SCALE_REPOSITORY_STARTS,
  fleetTargetKeys,
  focusedFleetKey,
  nextFrames,
  openFleetScope,
  seedFleetScale,
} from "./fleet-scale.fixture";

test.describe.configure({ timeout: 120_000 });

/** Marks the scroll owner of the first element matching `selector` with `data-test-scroll-owner`. */
async function markScrollOwner(page: Page, selector: string) {
  await page.evaluate((selector) => {
    document.querySelectorAll("[data-test-scroll-owner]").forEach((element) => element.removeAttribute("data-test-scroll-owner"));
    let element = document.querySelector(selector)?.parentElement ?? null;
    while (element && !(/(auto|scroll)/.test(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight)) element = element.parentElement;
    if (!element) throw new Error(`No scroll owner for ${selector}`);
    element.setAttribute("data-test-scroll-owner", "");
  }, selector);
  return page.locator("[data-test-scroll-owner]");
}

function card(page: Page, key: string) {
  return page.locator(`[data-agent-fleet-card="${key.replace(/["\\]/g, "\\$&")}"]`);
}

function repositoryOfTitle(title: string) {
  const workspace = Math.floor(Number(/Scale task (\d+)/.exec(title)![1]) / 50);
  return FLEET_SCALE_REPOSITORY_STARTS.findIndex((start, index) => workspace >= start && workspace < FLEET_SCALE_REPOSITORY_STARTS[index + 1]!);
}

/** The group label covering the top of the table body, and the first data row under it. */
function readTableTop(page: Page) {
  return page.evaluate(() => {
    const table = document.querySelector("[data-fleet-task-table] table")!;
    const columns = table.querySelector("thead tr")!.getBoundingClientRect();
    const x = columns.left + 48;
    const groupCell = document.elementFromPoint(x, columns.bottom + 2)?.closest("td, th");
    const groupRow = groupCell?.closest("tr");
    const groupLabel = groupRow?.querySelector("[role=checkbox]")?.getAttribute("aria-label") ?? null;
    let y = (groupCell?.getBoundingClientRect().bottom ?? columns.bottom) + 2;
    let dataRow = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-fleet-task-table-row]");
    if (!dataRow) { y += 40; dataRow = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-fleet-task-table-row]"); }
    return { groupLabel, firstTitle: dataRow?.textContent?.match(/Scale task \d+/)?.[0] ?? null };
  });
}

test("grouped table draws one control per group, with the sticky group of the first visible row and unique row indexes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seedFleetScale(page);
  await openFleetScope(page, "table", 2000);
  await page.getByRole("radiogroup", { name: "Group tasks" }).getByRole("radio", { name: "Repository", exact: true }).click();
  const table = page.locator("[data-fleet-task-table] table");
  await expect(table).toHaveAttribute("aria-rowcount", "2009");
  // At the top, the first group's control exists once.
  await expect(page.getByRole("checkbox", { name: /^Repository 0 \(50\)/ })).toHaveCount(1);
  const rowIndexes = () => table.evaluate((element) => [...element.querySelectorAll("tr")]
    .filter((row) => row.getAttribute("aria-hidden") !== "true")
    .map((row) => row.getAttribute("aria-rowindex")));
  const assertRowIndexes = async () => {
    const indexes = await rowIndexes();
    expect(indexes.every((index) => index !== null)).toBe(true);
    expect(new Set(indexes).size).toBe(indexes.length);
    expect(indexes[0]).toBe("1");
    expect(Math.max(...indexes.map(Number))).toBeLessThanOrEqual(2009);
  };
  await assertRowIndexes();

  // Mid-scroll: bring a group header just above the visible body.
  const scroller = await markScrollOwner(page, "[data-fleet-task-table-row]");
  await scroller.evaluate((element) => { element.scrollTop = element.scrollHeight / 2; });
  let label: string | null = null;
  for (let attempt = 0; attempt < 200 && !label; attempt += 1) {
    await nextFrames(page);
    label = await page.evaluate(() => {
      const table = document.querySelector("[data-fleet-task-table] table")!;
      const scroller = document.querySelector<HTMLElement>("[data-test-scroll-owner]")!;
      const columns = table.querySelector("thead tr")!.getBoundingClientRect();
      const viewport = scroller.getBoundingClientRect();
      for (const row of table.querySelectorAll("tbody tr")) {
        const checkbox = row.querySelector("[role=checkbox]");
        const name = checkbox?.getAttribute("aria-label") ?? "";
        if (!/^Repository \d+ \(\d+\)$/.test(name)) continue;
        const box = (row.querySelector("td") ?? row).getBoundingClientRect();
        if (box.top < columns.bottom + 120 || box.bottom > viewport.bottom) continue;
        scroller.scrollTop += box.top - columns.bottom + box.height + 4;
        return name;
      }
      scroller.scrollTop += scroller.clientHeight * 0.4;
      return null;
    });
  }
  expect(label).not.toBeNull();
  await nextFrames(page, 4);
  const top = await readTableTop(page);
  expect(top.groupLabel).toBe(label);
  expect(`Repository ${repositoryOfTitle(top.firstTitle!)}`).toBe(label!.replace(/ \(\d+\)$/, ""));
  await expect(page.locator(`[role=checkbox][aria-label="${label}"]`)).toHaveCount(1);
  await assertRowIndexes();
});

test("table keeps the focused row mounted and moves focus without re-centering", async ({ page }) => {
  await seedFleetScale(page);
  await openFleetScope(page, "table", 2000);
  const keys = await fleetTargetKeys(page, "table");
  const rows = page.locator("[data-fleet-task-table-row]");
  await rows.first().getByRole("button").last().focus();
  expect(await focusedFleetKey(page)).toBe(keys[0]);
  const scroller = await markScrollOwner(page, "[data-fleet-task-table-row]");
  await scroller.evaluate((element) => { element.scrollTop = element.scrollHeight / 2; });
  await nextFrames(page, 6);
  expect(await focusedFleetKey(page)).toBe(keys[0]);

  await scroller.evaluate((element) => { element.scrollTop = 2000; });
  await nextFrames(page, 6);
  const start = await page.evaluate(() => {
    const table = document.querySelector("[data-fleet-task-table] table")!;
    const head = table.querySelector("thead")!.getBoundingClientRect();
    const row = [...table.querySelectorAll<HTMLElement>("[data-fleet-task-table-row]")]
      .find((element) => element.getBoundingClientRect().top >= head.bottom + 1)!;
    [...row.querySelectorAll<HTMLElement>("button")].pop()!.focus({ preventScroll: true });
    return { key: row.dataset.fleetSelectKey!, scrollTop: document.querySelector<HTMLElement>("[data-test-scroll-owner]")!.scrollTop };
  });
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => focusedFleetKey(page)).toBe(keys[keys.indexOf(start.key) + 1]);
  await nextFrames(page, 4);
  expect(Math.abs(await scroller.evaluate((element) => element.scrollTop) - start.scrollTop)).toBeLessThanOrEqual(1);
});

test("Home on the first Tree card, then typing in Fleet search keeps focus in the search box", async ({ page }) => {
  await seedFleetScale(page, { layout: "tree" });
  await openFleetScope(page, "tree", 2000);
  await page.locator("[data-agent-fleet-card]").first().focus();
  await page.keyboard.press("Home");
  await nextFrames(page, 6);
  const search = page.getByRole("textbox", { name: "Find tasks" });
  await search.click();
  await page.keyboard.type("Scale task 00", { delay: 40 });
  await page.waitForTimeout(600);
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("Scale task 00");
});

for (const [size, workspaces, tasksPerWorkspace] of [["small", 2, 10], ["large", 40, 50]] as const) {
  test(`Tree keys wrap and j/k match the arrows in a ${size} list`, async ({ page }) => {
    await seedFleetScale(page, { layout: "tree", workspaces, tasksPerWorkspace });
    const count = workspaces * tasksPerWorkspace;
    await openFleetScope(page, "tree", count);
    const keys = await fleetTargetKeys(page, "tree");
    await card(page, keys[0]!).focus();
    for (const [key, expected] of [["k", count - 1], ["j", 0], ["ArrowUp", count - 1], ["ArrowDown", 0], ["End", count - 1], ["Home", 0], ["j", 1], ["k", 0]] as const) {
      await page.keyboard.press(key);
      await expect.poll(() => focusedFleetKey(page), { message: key }).toBe(keys[expected]);
    }
  });
}

test("grouped Tree is one list scrolled by the board, and arrows cross groups", async ({ page }) => {
  await seedFleetScale(page, { layout: "tree" });
  await openFleetScope(page, "tree", 2000);
  await page.getByRole("radiogroup", { name: "Group tasks" }).getByRole("radio", { name: "Repository", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: /^Repository 0 \(50\)/ })).toBeVisible();
  const nested = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-fleet-agent-tree] *")]
    .filter((element) => /(auto|scroll)/.test(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight).length);
  expect(nested).toBe(0);
  const keys = await fleetTargetKeys(page, "tree");
  const board = page.locator("[data-fleet-board-scroll]");
  await card(page, keys[0]!).focus();
  for (let index = 1; index <= 50; index += 1) {
    await page.keyboard.press(index % 2 ? "ArrowDown" : "j");
    await expect.poll(() => focusedFleetKey(page)).toBe(keys[index]);
  }
  expect(await board.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(card(page, keys[50]!)).toBeInViewport();
});

test("Tree opens a card without moving it and keeps the focused card mounted", async ({ page }) => {
  await seedFleetScale(page, { layout: "tree" });
  await openFleetScope(page, "tree", 2000);
  const keys = await fleetTargetKeys(page, "tree");
  const owner = await markScrollOwner(page, "[data-agent-fleet-card]");
  await owner.evaluate((element) => { element.scrollTop = 3000; });
  await nextFrames(page, 6);
  const picked = await page.evaluate(() => {
    const owner = document.querySelector<HTMLElement>("[data-test-scroll-owner]")!.getBoundingClientRect();
    const card = [...document.querySelectorAll<HTMLElement>("[data-agent-fleet-card]")]
      .find((element) => element.getBoundingClientRect().top > owner.top + 40 && element.getAttribute("aria-expanded") !== "true")!;
    return { key: card.dataset.agentFleetCard!, top: card.getBoundingClientRect().top };
  });
  const picker = card(page, picked.key);
  await picker.click();
  await expect(picker).toHaveAttribute("aria-expanded", "true");
  await nextFrames(page, 6);
  expect(Math.abs((await picker.boundingBox())!.y - picked.top)).toBeLessThanOrEqual(2);

  await picker.focus();
  await owner.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await nextFrames(page, 6);
  expect(await focusedFleetKey(page)).toBe(picked.key);
  expect(keys).toContain(picked.key);
});
