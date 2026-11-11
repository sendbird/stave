import { expect, test, type Page } from "@playwright/test";

const dock = (page: Page) => page.locator("[data-tars-decision-dock]");
const active = (page: Page) => dock(page).locator("[data-tars-dock-item]:not([hidden])");
const editor = (page: Page) => page.locator("[data-tars-composer] [role='textbox']");

/** Three independent asks in one real preview message; the host's existing answer bridge handles them. */
async function queue(page: Page, query = "") {
  await page.goto(`/?stavePreview=tars&decision=ask${query}`);
  await editor(page).fill("Review the release check");
  await editor(page).press("Enter");
  await expect(dock(page)).toBeVisible();
  await page.evaluate(async () => {
    const saved = JSON.parse(sessionStorage.getItem("stave-preview-conversation")!);
    const host = window as unknown as { api: { tars: { get: () => Promise<unknown> } } };
    const snapshot = JSON.parse(JSON.stringify(await host.api.tars.get()));
    const work = snapshot.responsibilities[0];
    const base = saved.receipts[0];
    const questions = ["First question · 첫 번째 질문", "Second question · 두 번째 질문", "Third question · 세 번째 질문"];
    snapshot.responsibilities = questions.map((_question, index) => ({ ...work, id: `queue-work-${index}` }));
    sessionStorage.setItem("stave-preview-identity", JSON.stringify(snapshot));
    saved.receipts = questions.map((question, actionIndex) => ({ ...base, actionIndex, action: { kind: "ask", question, recommended: 0,
      options: [{ label: "Pause · 멈추기", rationale: "Wait for review. 검토를 기다립니다.",
        effect: { kind: "control", responsibilityId: `queue-work-${actionIndex}`, expectedRevision: work.revision, operation: "pause" } },
        { label: "Take over · 직접 맡기", rationale: "Review the work yourself. 직접 검토합니다.",
          effect: { kind: "control", responsibilityId: `queue-work-${actionIndex}`, expectedRevision: work.revision, operation: "takeover" } }] } }));
    saved.messages[0].decision.actions = saved.receipts.map((receipt: { action: unknown }) => receipt.action);
    saved.messages[0].reply = "Earlier conversation. 이전 대화입니다.\n\n".repeat(80);
    sessionStorage.setItem("stave-preview-conversation", JSON.stringify(saved));
  });
  await page.reload();
  await expect(dock(page).getByRole("status")).toContainText(/1 of 3|3개 중 1번째/);
}

test("one keyboard-active form, navigation preserves choices, answering advances and history remains readable", async ({ page }) => {
  await queue(page);
  await expect(page.locator("[data-tars-waiting-record]")).toHaveCount(3);
  await expect(page.getByRole("radiogroup")).toHaveCount(1);
  const previous = dock(page).locator("[data-tars-dock-previous]");
  await previous.hover();
  await expect(page.getByRole("tooltip")).toHaveText("Previous waiting item");
  await expect(previous).toBeDisabled();
  await previous.press("Enter");
  await expect(dock(page).getByRole("status")).toContainText("1 of 3");
  await dock(page).locator("[data-tars-dock-next]").hover();
  await expect(page.getByRole("tooltip")).toHaveText("Next waiting item");
  const firstId = await active(page).getAttribute("data-tars-dock-item");
  await active(page).locator("[data-tars-decision]").focus();
  await page.keyboard.press("2");
  await dock(page).getByRole("button", { name: "Next waiting item" }).click();
  await expect(active(page)).toContainText("Second question");
  await expect(active(page).locator("[data-tars-decision]")).toBeFocused();
  await dock(page).getByRole("button", { name: "Previous waiting item" }).click();
  await expect(active(page).getByRole("radio").nth(1)).toBeChecked();
  await page.keyboard.press("Enter");
  await expect(dock(page).getByRole("status")).toHaveText("Waiting · 1 of 2");
  await expect(active(page)).toContainText("Second question");
  await expect(active(page).locator("[data-tars-decision]")).toBeFocused();
  await expect(page.locator(`[data-tars-decision="${firstId}"][data-tars-decision-state="answered"]`)).toContainText("Take over · 직접 맡기");
  await expect(page.locator("[data-tars-waiting-record]")).toHaveCount(2);
  // Not now never answers or retires: it skips to the other waiting item.
  await page.keyboard.press("Escape");
  await expect(active(page)).toContainText("Third question");
  await expect(dock(page).getByRole("status")).toHaveText("Waiting · 2 of 2");
  await page.keyboard.press("Enter");
  await expect(active(page)).toContainText("Second question");
  await expect(dock(page).getByRole("status")).toHaveText("Waiting · 1 of 1");
  await page.keyboard.press("Escape");
  await expect(editor(page)).toBeFocused();
  await expect(dock(page)).toBeVisible();
  await active(page).locator("[data-tars-decision]").focus();
  await page.keyboard.press("Enter");
  await expect(dock(page)).toHaveCount(0);
  await expect(page.locator('[data-tars-decision-state="answered"]')).toHaveCount(3);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("stave-preview-conversation")!).answers.length)).toBe(3);
});

test("history review opens a specific queued question without a duplicate answer form", async ({ page }) => {
  await queue(page);
  await page.locator("[data-tars-waiting-record]").nth(2).getByRole("button").click();
  await expect(active(page)).toContainText("Third question");
  await expect(active(page).locator("[data-tars-decision]")).toBeFocused();
  await expect(page.getByRole("radiogroup")).toHaveCount(1);
});

test("refused answers keep the same item and draft; stale decisions leave readable history", async ({ page }) => {
  await page.goto("/?stavePreview=tars&decision=ask&controlRefusal=true");
  await editor(page).fill("Ask about the release");
  await editor(page).press("Enter");
  await expect(dock(page)).toBeVisible();
  const id = await active(page).getAttribute("data-tars-dock-item");
  await editor(page).fill("1");
  await editor(page).press("Enter");
  await expect(active(page)).toHaveAttribute("data-tars-dock-item", id!);
  await expect(active(page).locator('[data-tars-decision-attempt="rejected"]')).toBeVisible();
  await expect(editor(page)).toHaveText("1");
  await page.evaluate(() => {
    const saved = JSON.parse(sessionStorage.getItem("stave-preview-conversation")!);
    saved.receipts[0].action.options[0].effect.expectedRevision = 999;
    sessionStorage.setItem("stave-preview-conversation", JSON.stringify(saved));
  });
  await page.reload();
  await expect(dock(page)).toHaveCount(0);
  await expect(page.locator('[data-tars-decision-state="invalid"]')).toBeVisible();
});

for (const theme of ["light", "dark"]) for (const lang of ["en", "ko"]) for (const density of ["regular", "compact"]) {
  test(`dock containment, tokens and keyboard entry: ${theme} ${lang} ${density}`, async ({ page }) => {
    await queue(page, `&theme=${theme}&lang=${lang}&density=${density}`);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => document.fonts.ready);
      const geometry = await dock(page).evaluate((node) => {
        const body = node.querySelector("[data-tars-dock-body]")!;
        const header = node.firstElementChild!;
        const nav = header.lastElementChild!;
        const label = header.firstElementChild!;
        const form = document.querySelector("[data-tars-composer] form")!;
        const root = document.querySelector('[data-testid="tars-view"]')!;
        const rect = (element: Element) => element.getBoundingClientRect();
        const center = (element: Element) => (rect(element).top + rect(element).bottom) / 2;
        const token = (name: string) => {
          const probe = document.createElement("div"); probe.style.height = `var(${name})`; node.append(probe);
          const height = rect(probe).height; probe.remove(); return height;
        };
        return { gap: rect(body).top - rect(header).bottom, expectedGap: token("--aui-space-8"),
          bottomGap: rect(form).top - rect(node).bottom, form: rect(form).toJSON(), dock: rect(node).toJSON(),
          bodyHeight: rect(body).height, viewport: innerHeight, overflow: root.scrollWidth - root.clientWidth,
          centerDelta: Math.abs(center(nav) - center(label)), bodyOverflow: body.scrollWidth - body.clientWidth };
      });
      // One CSS-pixel tolerance covers fractional token conversion and subpixel flex sizing.
      expect(Math.abs(geometry.gap - geometry.expectedGap)).toBeLessThanOrEqual(1);
      expect(geometry.centerDelta).toBeLessThanOrEqual(1);
      expect(geometry.bodyHeight).toBeLessThanOrEqual(geometry.viewport * 0.4 + 1);
      expect(geometry.dock.top).toBeGreaterThanOrEqual(0);
      expect(geometry.bottomGap).toBeGreaterThanOrEqual(0);
      expect(geometry.form.bottom).toBeLessThanOrEqual(geometry.viewport);
      expect(geometry.bodyOverflow).toBeLessThanOrEqual(1);
      expect(geometry.overflow).toBeLessThanOrEqual(1);
      await dock(page).locator("[data-tars-dock-next]").focus();
      await page.keyboard.press("Enter");
      await expect(active(page).locator("[data-tars-decision]")).toBeFocused();
      await expect(page.getByRole("radiogroup")).toHaveCount(1);
    }
  });
}

test("an answer in flight disables navigation; a transport failure keeps the question retryable", async ({ page }) => {
  await queue(page);
  await page.evaluate(() => {
    const host = window as unknown as { api: { tars: { answer: (...args: unknown[]) => Promise<unknown> } }; failAnswer: () => void };
    const original = host.api.tars.answer;
    host.api.tars.answer = () => new Promise((_resolve, reject) => { host.failAnswer = () => { host.api.tars.answer = original; reject(new Error("Preview answer transport failure")); }; });
  });
  const id = await active(page).getAttribute("data-tars-dock-item");
  await active(page).locator("[data-tars-decision-submit]").click();
  await expect(dock(page)).toHaveAttribute("aria-busy", "true");
  await expect(dock(page).locator("[data-tars-dock-next]")).toBeDisabled();
  await page.evaluate(() => (window as unknown as { failAnswer: () => void }).failAnswer());
  await expect(active(page).getByRole("alert")).toBeVisible();
  await expect(active(page)).toHaveAttribute("data-tars-dock-item", id!);
  await expect(dock(page).getByRole("status")).toHaveText("Waiting · 1 of 3");
  await active(page).locator("[data-tars-decision-submit]").click();
  await expect(active(page)).toContainText("Second question");
});

test("publish edits survive queue navigation and its existing report opener selects the queued card", async ({ page }) => {
  await page.goto("/?stavePreview=tars&publish=true");
  await expect(dock(page).locator("[data-tars-publish-message]")).toBeEditable();
  await page.evaluate(async () => {
    const host = window as unknown as { api: { tars: { getConversation: () => Promise<unknown> } } };
    const saved = JSON.parse(JSON.stringify(await host.api.tars.getConversation()));
    const base = saved.receipts.find((receipt: { action: { kind: string } }) => receipt.action.kind === "publish");
    saved.receipts.push({ ...base, actionIndex: 1, action: { kind: "ask", question: "Review before publication?", recommended: 0,
      options: [{ label: "Continue", effect: { kind: "reply" } }, { label: "Explain", effect: { kind: "reply" } }] } });
    sessionStorage.setItem("stave-preview-conversation", JSON.stringify(saved));
  });
  await page.reload();
  await expect(active(page)).toContainText("Review before publication?");
  await dock(page).locator("[data-tars-dock-next]").click();
  const commit = active(page).locator("[data-tars-publish-message]");
  await commit.fill("fix: keep my edited subject");
  await dock(page).locator("[data-tars-dock-previous]").click();
  // The report's original opener reuses the waiting proposal instead of creating another form.
  await page.locator("[data-tars-output='report']").filter({ hasText: "Show the saved card first at checkout" }).getByRole("button").click();
  await page.locator("[data-tars-report-publish] [data-tars-publish-open]").click();
  await expect(commit).toBeFocused();
  await expect(commit).toHaveValue("fix: keep my edited subject");
  await expect(page.getByRole("textbox", { name: "Commit message", exact: true })).toHaveCount(1);
  await expect(dock(page).getByRole("status")).toHaveText("Waiting · 2 of 2");
});

test("a long publication and inline side view keep the composer inside the owning chat column", async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 800 });
  await page.goto("/?stavePreview=tars&publish=true");
  const card = dock(page).locator("[data-tars-publish-card]");
  await expect(card).toHaveAttribute("data-tars-publish-state", "waiting");
  await card.getByRole("button", { name: "Open Show the saved card first at checkout", exact: true }).click();
  const side = page.locator("[data-tars-side-view]");
  await expect(side).toBeVisible();
  const geometry = await page.locator("[data-tars-chat]").evaluate((chat) => {
    const box = (selector: string) => chat.querySelector(selector)!.getBoundingClientRect();
    const body = chat.querySelector("[data-tars-dock-body]")!;
    return { chat: chat.getBoundingClientRect().toJSON(), side: box("[data-tars-side-view]").toJSON(),
      dock: box("[data-tars-decision-dock]").toJSON(), form: box("[data-tars-composer] form").toJSON(),
      bodyScrolls: body.scrollHeight > body.clientHeight };
  });
  expect(geometry.dock.top).toBeGreaterThanOrEqual(geometry.side.bottom - 1);
  expect(geometry.form.bottom).toBeLessThanOrEqual(geometry.chat.bottom);
  expect(geometry.bodyScrolls).toBe(true);
  await card.locator("[data-tars-publish-message]").fill("fix: preserve the owning column");
  await expect(editor(page)).toBeEditable();
});
