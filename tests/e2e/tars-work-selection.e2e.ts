import { expect, test } from "@playwright/test";

test.describe.configure({ timeout: 90_000 });

for (const [lang, theme, density] of [["en", "light", "regular"], ["ko", "dark", "compact"]]) {
  test(`work search, keyboard, target restore and result follow-up: ${lang} ${theme} ${density}`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/?stavePreview=tars&outputs=true&tray=true&lang=${lang}&theme=${theme}&density=${density}`);
    const composer = page.locator("[data-tars-composer]");
    const editor = composer.getByRole("textbox");
    await expect(editor).toBeEditable();
    await page.evaluate(() => document.fonts.ready);
    await editor.fill("@");
    const search = editor;
    await expect(search).toBeVisible();
    await search.fill("@checkout");
    const option = page.getByRole("option").filter({ hasText: "Show the saved card first" });
    await expect(option).toHaveCount(1);
    await expect(option).toContainText("checkout");
    await search.press("ArrowDown");
    await search.press("Enter");
    await expect(composer.locator("[data-tars-work-selection]")).toContainText("Show the saved card first");
    await editor.fill("Use the second proposal, and check the narrow layout.");
    await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("stave-preview-draft") ?? "null")?.target?.responsibilityId)).toBe("checkout");
    await page.reload();
    await expect(editor).toHaveText("Use the second proposal, and check the narrow layout.");
    await expect(composer.locator("[data-tars-work-selection]")).toContainText("Show the saved card first");
    await composer.locator("[data-tars-target-open]").click();
    const report = page.locator('[data-tars-side-view="report"]');
    await expect(report).toBeVisible();
    await report.locator('[data-tars-select-work="checkout"]').click();
    await expect(editor).toBeFocused();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => document.fonts.ready);
      const geometry = await composer.locator("[data-tars-work-selection]").evaluate((node) => {
        const box = node.getBoundingClientRect();
        const children = [...node.children].map((child) => child.getBoundingClientRect()).filter((b) => b.width);
        return { overflow: node.scrollWidth - node.clientWidth, left: box.left, right: box.right,
          min: Math.min(...children.map((b) => b.left)), max: Math.max(...children.map((b) => b.right)),
          gap: getComputedStyle(node.querySelector("[data-tars-target-chip]")!).gap, expectedGap: getComputedStyle(document.documentElement).getPropertyValue("--aui-space-4").trim() };
      });
      expect(geometry.overflow).toBeLessThanOrEqual(1);
      expect(geometry.min).toBeGreaterThanOrEqual(geometry.left - 1);
      expect(geometry.max).toBeLessThanOrEqual(geometry.right + 1);
      const gap = await composer.locator("[data-tars-work-selection]").evaluate((node) => {
        const probe = document.createElement("div"); probe.style.width = "var(--aui-space-4)"; node.append(probe);
        const expected = probe.getBoundingClientRect().width; probe.remove();
        return { actual: parseFloat(getComputedStyle(node.querySelector("[data-tars-target-chip]")!).gap), expected };
      });
      expect(Math.abs(gap.actual - gap.expected)).toBeLessThanOrEqual(0.5);
      await page.screenshot({ path: testInfo.outputPath(`after-${lang}-${theme}-${width}.png`) });
    }
    await composer.getByRole("button", { name: lang === "ko" ? "보내기" : "Send", exact: true }).click();
    await expect(page.locator('[data-tars-message-target="checkout"]').last()).toBeVisible();
    const sent = await page.evaluate(() => JSON.parse(sessionStorage.getItem("stave-preview-conversation")!).messages.at(-1));
    expect(sent.target).toEqual({ responsibilityId: "checkout" });
    await expect(composer.getByRole("button", { name: lang === "ko" ? "선택 해제" : "Clear target", exact: true })).toHaveCount(0);
    await editor.fill("@");
    await search.fill("@no-such-work");
    await expect(page.getByText(lang === "ko" ? "일치하는 작업이 없습니다" : "No matching work", { exact: true })).toBeVisible();
    await search.press("Escape");
    await editor.fill("@");
    await expect(page.getByRole("option")).toHaveCount(2);
    await search.press("Escape");
  });
}

test("card follow-up selects rather than sends and clear removes the target", async ({ page }) => {
  await page.goto("/?stavePreview=tars&outputs=true&tray=true");
  const composer = page.locator("[data-tars-composer]");
  await expect(composer.getByRole("textbox")).toBeEditable();
  await page.locator('[data-tars-card="search"] [data-tars-select-work]').click();
  await expect(composer.locator("[data-tars-work-selection]")).toContainText("Speed up the search index rebuild");
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("stave-preview-draft") ?? "null")?.target)).toEqual({ responsibilityId: "search" });
  await page.reload();
  await expect(composer.locator("[data-tars-target-chip]")).toContainText("Speed up the search index rebuild");
  await expect(composer.getByRole("textbox")).toHaveText("");
  const count = await page.locator("[data-tars-message]").count();
  await composer.getByRole("button", { name: "Clear target", exact: true }).click();
  await expect(composer.locator("[data-tars-work-selection]")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("stave-preview-draft"))).toBeNull();
  await page.reload();
  await expect(composer.getByRole("textbox")).toBeEditable();
  await expect(composer.locator("[data-tars-work-selection]")).toHaveCount(0);
  expect(await page.locator("[data-tars-message]").count()).toBe(count);
});


test("long identical titles use repository/ID identity across rename and state changes at narrow width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/?stavePreview=tars&outputs=true&lang=ko&theme=dark&density=compact");
  const composer = page.locator("[data-tars-composer]");
  await expect(composer.getByRole("textbox")).toBeEditable();
  await page.evaluate(async () => {
    const snapshot = await window.api.tars.get();
    snapshot.responsibilities = snapshot.responsibilities.map((row, index) => ({ ...row,
      title: "결제 화면의 긴 작업 제목과 유사한 요청을 정확한 작업에 연결하고 좁은 패널에서도 대상 정보를 확인합니다 ".repeat(3),
      repositoryPath: `/tmp/project-${index}` }));
    sessionStorage.setItem("stave-preview-identity", JSON.stringify(snapshot));
  });
  await page.reload();
  const editor = composer.getByRole("textbox");
  await editor.fill("@");
  const search = editor;
  await search.fill("@project-1");
  await expect(page.getByRole("option")).toHaveCount(1);
  await expect(page.getByRole("option")).toContainText("search");
  await search.press("ArrowDown"); await search.press("Enter");
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("stave-preview-draft") ?? "null")?.target)).toEqual({ responsibilityId: "search" });
  await page.evaluate(() => document.fonts.ready);
  expect(await composer.locator("[data-tars-work-selection]").evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  await page.evaluate(() => {
    const snapshot = JSON.parse(sessionStorage.getItem("stave-preview-identity")!);
    snapshot.responsibilities[1].title = "바뀐 작업 제목";
    snapshot.responsibilities[1].state = "waiting";
    snapshot.responsibilities[1].revision++;
    sessionStorage.setItem("stave-preview-identity", JSON.stringify(snapshot));
  });
  await page.reload();
  await expect(composer.locator("[data-tars-work-selection]")).toContainText("바뀐 작업 제목");
  await expect(composer.locator("[data-tars-target-open]")).toHaveAttribute("aria-description", /search/);
  await expect(composer.locator("[data-tars-work-selection]")).toContainText("project-1");
  await page.evaluate(() => document.fonts.ready);
  expect(await composer.locator("[data-tars-work-selection]").evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
});

test("inline mentions preserve middle-caret text, dismiss on Escape/blur and let IME own keys", async ({ page }) => {
  await page.goto("/?stavePreview=tars&outputs=true&tray=true");
  const composer = page.locator("[data-tars-composer]");
  const editor = composer.getByRole("textbox");
  const options = page.getByRole("option");
  await expect(editor).toBeEditable();
  const count = await page.locator("[data-tars-message]").count();
  for (const text of ["plain request", "email@example.com", "/help", "!assign", "$skill"]) {
    await editor.fill(text);
    await expect(options).toHaveCount(0);
    await expect(composer.getByRole("combobox")).toHaveCount(0);
    await expect(page.locator("input[role=combobox]")).toHaveCount(0);
  }
  await editor.fill("before @sea after");
  await editor.press("Home");
  for (let i = 0; i < "before @sea".length; i++) await editor.press("ArrowRight");
  await expect.poll(() => editor.evaluate((node) => {
    const selection = getSelection()!;
    const range = document.createRange(); range.selectNodeContents(node);
    range.setEnd(selection.focusNode!, selection.focusOffset);
    return range.toString().length;
  })).toBe("before @sea".length);
  await expect(options).toHaveCount(1);
  await expect(options).toContainText("search");
  await editor.press("ArrowUp");
  await editor.press("Enter");
  await expect(composer.locator("[data-tars-target-chip]")).toContainText("Speed up");
  await expect(editor).toHaveText("before after");
  await editor.press("i");
  await expect(editor).toHaveText("before iafter");
  expect(await page.locator("[data-tars-message]").count()).toBe(count);
  await composer.getByRole("button", { name: "Clear target", exact: true }).click();
  await editor.fill("@");
  await expect(options).toHaveCount(2);
  await editor.press("Escape");
  await expect(options).toHaveCount(0);
  await expect(editor).toHaveText("@");
  await editor.press("z");
  await expect(page.getByText("No matching work", { exact: true })).toBeVisible();
  await composer.getByRole("button", { name: "Attach files", exact: true }).focus();
  await expect(page.getByText("No matching work", { exact: true })).toHaveCount(0);
  await editor.fill("@search");
  await expect(options).toHaveCount(1);
  await editor.dispatchEvent("compositionstart", { data: "검" });
  await editor.dispatchEvent("keydown", { key: "ArrowDown", code: "ArrowDown", isComposing: true });
  await editor.dispatchEvent("keydown", { key: "Enter", code: "Enter", isComposing: true });
  await editor.dispatchEvent("keydown", { key: "Escape", code: "Escape", isComposing: true });
  await expect(options).toHaveCount(1);
  await expect(composer.locator("[data-tars-work-selection]")).toHaveCount(0);
  expect(await page.locator("[data-tars-message]").count()).toBe(count);
  await editor.dispatchEvent("compositionend", { data: "검" });
  await editor.press("ArrowDown");
  await editor.press("Enter");
  await expect(composer.locator("[data-tars-target-open]")).toHaveAttribute("aria-description", /search/);
});

for (const lang of ["en", "ko"]) for (const theme of ["light", "dark"]) for (const density of ["regular", "compact"]) {
  test(`mention candidates and long chip geometry: ${lang} ${theme} ${density}`, async ({ page }, testInfo) => {
    await page.goto(`/?stavePreview=tars&outputs=true&lang=${lang}&theme=${theme}&density=${density}`);
    const composer = page.locator("[data-tars-composer]");
    const editor = composer.getByRole("textbox");
    await expect(editor).toBeEditable();
    await page.evaluate(async () => {
      const snapshot = await window.api.tars.get();
      snapshot.responsibilities = snapshot.responsibilities.map((row, index) => ({ ...row,
        title: "긴 작업 제목 LongTitleWithoutBreaks".repeat(16), repositoryPath: `/tmp/${"repository".repeat(14)}-${index}` }));
      sessionStorage.setItem("stave-preview-identity", JSON.stringify(snapshot));
    });
    await page.reload();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => document.fonts.ready);
      await editor.fill("일반 요청 Plain request");
      await expect(page.getByRole("option")).toHaveCount(0);
      await expect(page.locator("[role=combobox]")).toHaveCount(0);
      await editor.fill("@search");
      const option = page.getByRole("option");
      await expect(option).toHaveCount(1);
      await expect(page.getByText(lang === "ko" ? "@ 뒤에 입력해 작업을 검색하세요. 방향키와 Enter로 선택하고 Escape로 닫습니다." : "Type after @ to search work. Use arrow keys and Enter to select; Escape closes.", { exact: true })).toBeVisible();
      const menu = await option.evaluate((node) => {
        const box = node.getBoundingClientRect(); const copy = node.firstElementChild!;
        return { left: box.left, right: box.right, viewport: innerWidth,
          overflow: node.scrollWidth - node.clientWidth, textOverflow: copy.scrollWidth - copy.clientWidth,
          padding: parseFloat(getComputedStyle(node).paddingLeft),
          expectedPadding: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--aui-space-12")) * parseFloat(getComputedStyle(document.documentElement).fontSize) };
      });
      expect(menu.left).toBeGreaterThanOrEqual(0);
      expect(menu.right).toBeLessThanOrEqual(menu.viewport);
      expect(menu.overflow).toBeLessThanOrEqual(1);
      expect(menu.textOverflow).toBeLessThanOrEqual(1);
      expect(Math.abs(menu.padding - menu.expectedPadding)).toBeLessThanOrEqual(0.5);
      await editor.press("ArrowDown"); await editor.press("Enter");
      const geometry = await composer.locator("[data-tars-work-selection]").evaluate((node) => {
        const box = node.getBoundingClientRect(); const chip = node.querySelector('[data-tars-target-chip]')!; const title = node.querySelector('[data-tars-target-title]')!;
        const buttons = [...node.querySelectorAll("button")]; const first = buttons[0].getBoundingClientRect(); const last = buttons[1].getBoundingClientRect();
        return { overflow: node.scrollWidth - node.clientWidth, chipOverflow: chip.scrollWidth - chip.clientWidth,
          ellipsis: getComputedStyle(title).textOverflow, labelOverflow: title.scrollWidth - title.clientWidth,
          contained: [...node.children].every((child) => { const rect = child.getBoundingClientRect(); return rect.left >= box.left - 0.5 && rect.right <= box.right + 0.5; }),
          centerDelta: (first.top + first.bottom - last.top - last.bottom) / 2,
          padding: parseFloat(getComputedStyle(node).paddingLeft), gap: parseFloat(getComputedStyle(node.querySelector("[data-tars-target-chip]")!).gap),
          expectedGap: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--aui-space-4")) * parseFloat(getComputedStyle(document.documentElement).fontSize),
          expectedPadding: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--aui-space-8")) * parseFloat(getComputedStyle(document.documentElement).fontSize) };
      });
      expect(geometry.overflow).toBeLessThanOrEqual(1); expect(geometry.chipOverflow).toBeLessThanOrEqual(1);
      expect(geometry.ellipsis).toBe("ellipsis"); expect(geometry.labelOverflow).toBeGreaterThan(0);
      expect(geometry.contained).toBe(true); expect(Math.abs(geometry.centerDelta)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(geometry.padding - geometry.expectedPadding)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(geometry.gap - geometry.expectedGap)).toBeLessThanOrEqual(0.5);
      await page.screenshot({ path: testInfo.outputPath(`chip-${lang}-${theme}-${density}-${width}.png`) });
      await composer.getByRole("button", { name: lang === "ko" ? "선택 해제" : "Clear target", exact: true }).click();
      await expect(composer.locator("[data-tars-work-selection]")).toHaveCount(0);
    }
  });
}

test("mention acceptance reads the pending editor selection before it commits", async ({ page }) => {
  await page.goto("/?stavePreview=tars&outputs=true");
  const composer = page.locator("[data-tars-composer]");
  const editor = composer.getByRole("textbox");
  await expect(editor).toBeEditable();
  await editor.fill("before @sea after");
  await editor.press("Home");
  for (let i = 0; i < "before @se".length; i++) await editor.press("ArrowRight");
  await expect(page.getByRole("option")).toHaveCount(1);
  await editor.press("ArrowDown");
  const selections = await editor.evaluate(async (root) => {
    // Reuse the exact optimized module URL already used by the rendered editor.
    const source = await (await fetch("/src/components/ai-elements/prompt-lexical-editor.tsx")).text();
    const moduleUrl = source.match(/from "([^"\n]*\/lexical\.js\?[^"\n]*)"/)![1];
    const { getNearestEditorFromDOMNode, $getRoot, $getSelection } = await import(moduleUrl);
    const lexical = getNearestEditorFromDOMNode(root)!;
    let committed = -1; let pending = -1;
    lexical.update(() => {
      $getRoot().getFirstDescendant()!.select(11, 11);
      committed = lexical.getEditorState().read(() => $getSelection()!.focus.offset);
      pending = $getSelection()!.focus.offset;
      root.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    }, { discrete: true });
    return { committed, pending };
  });
  expect(selections).toEqual({ committed: 10, pending: 11 });
  await expect(composer.locator("[data-tars-target-chip]")).toContainText("Speed up");
  await expect(editor).toHaveText("before after");
});

for (const lang of ["en", "ko"]) {
  test(`selected chip distinguishes twins, updates and removes without losing the draft: ${lang}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`/?stavePreview=tars&outputs=true&lang=${lang}`);
    const composer = page.locator("[data-tars-composer]");
    const editor = composer.getByRole("textbox");
    await expect(editor).toBeEditable();
    await page.evaluate(async () => {
      const snapshot = await window.api.tars.get();
      snapshot.responsibilities = snapshot.responsibilities.map((row, index) => ({ ...row,
        title: "같은 제목 Same work", repositoryPath: `/tmp/${index ? "beta" : "alpha"}/shared` }));
      sessionStorage.setItem("stave-preview-identity", JSON.stringify(snapshot));
    });
    await page.reload();
    await editor.fill("@search"); await editor.press("ArrowDown"); await editor.press("Enter");
    const open = composer.locator("[data-tars-target-open]");
    const identity = composer.locator("[data-tars-target-identity]");
    await expect(identity).toContainText("beta/shared");
    await expect(identity).not.toContainText("/tmp/");
    await expect(open).toHaveAttribute("aria-description", /\/tmp\/beta\/shared\n.*search/);
    // Keyboard focus exposes the same complete identity as pointer hover.
    await open.focus();
    await expect(page.getByRole("tooltip")).toContainText("/tmp/beta/shared");
    await expect(page.getByRole("tooltip")).toContainText("search");
    await editor.fill("초안 Keep these words");
    await composer.getByRole("button", { name: lang === "ko" ? "작업 중인 변경 포함" : "Include my working changes", exact: true }).click();
    const messageCount = await page.locator("[data-tars-message]").count();
    await open.click();
    await expect(page.locator('[data-tars-side-view="report"]')).toBeVisible();
    await expect(composer.locator("[data-tars-work-selection]")).toBeVisible();
    await expect(editor).toHaveText("초안 Keep these words");
    // Read the changed host snapshot through the mounted view’s focus refresh.
    await page.evaluate(async () => {
      const snapshot = JSON.parse(sessionStorage.getItem("stave-preview-identity")!);
      snapshot.responsibilities.forEach((row: { repositoryPath: string; state: string; revision: number }) => {
        row.repositoryPath = "/tmp/shared"; row.state = "waiting"; row.revision++;
      });
      sessionStorage.setItem("stave-preview-identity", JSON.stringify(snapshot));
      window.api.tars.get = async () => structuredClone(snapshot);
      window.dispatchEvent(new Event("focus"));
    });
    await expect(identity).toContainText(lang === "ko" ? "작업 2" : "Work 2");
    await expect(identity).toContainText(lang === "ko" ? "응답 대기" : "Waiting");
    await expect(open).toHaveAttribute("aria-description", /search/);
    await page.evaluate(async () => {
      const snapshot = JSON.parse(sessionStorage.getItem("stave-preview-identity")!);
      snapshot.responsibilities = snapshot.responsibilities.filter((row: { id: string }) => row.id !== "search");
      window.api.tars.get = async () => structuredClone(snapshot);
      window.dispatchEvent(new Event("focus"));
    });
    await expect(composer.locator("[data-tars-target-title]")).toHaveText(lang === "ko" ? "선택한 작업을 확인할 수 없습니다" : "Selected work is unavailable");
    await expect(open).toHaveCount(0);
    await expect(composer.locator("[data-tars-target-chip]")).not.toContainText("search");
    await composer.getByRole("button", { name: lang === "ko" ? "선택 해제" : "Clear target", exact: true }).click();
    await expect(editor).toBeFocused();
    await expect(editor).toHaveText("초안 Keep these words");
    await expect(composer.getByRole("button", { name: lang === "ko" ? "작업 중인 변경 포함" : "Include my working changes", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("stave-preview-draft") ?? "null"))).toMatchObject({ text: "초안 Keep these words", includeWorkingChanges: true });
    await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("stave-preview-draft") ?? "null")?.target)).toBeUndefined();
    expect(await page.locator("[data-tars-message]").count()).toBe(messageCount);
  });
}
