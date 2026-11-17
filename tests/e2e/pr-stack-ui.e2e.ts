import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

async function mount(page: Page, language = "en", theme = "light", conflict = false) {
  await page.goto("/?stavePreview=command-palette");
  await page.evaluate(async ({ language, theme, conflict }) => {
    const reactModule = await import("/node_modules/.vite/deps/react.js");
    const React = reactModule.default ?? reactModule;
    const domModule = await import("/node_modules/.vite/deps/react-dom_client.js");
    const { createRoot } = domModule.default ?? domModule;
    const { i18n } = await import("/src/i18n/index.ts");
    const { PullRequestStackNotice } = await import("/src/components/layout/pull-request/PullRequestStackNotice.tsx");
    await i18n.changeLanguage(language);
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.body.replaceChildren();
    const host = document.createElement("div");
    host.style.width = "240px";
    document.body.append(host);
    const pr = (number: number, head: string, base: string, state: string) => ({ number, title: `Change ${number}`, headRefName: head, baseRefName: base, state, url: `https://example.test/pull/${number}` });
    const parent = pr(1, "feature/base", "main", "MERGED");
    const current = pr(2, "feature/child", "feature/base", "OPEN");
    const child = pr(3, "feature/leaf", "feature/child", "OPEN");
    (window as unknown as { stackUpdates: unknown[] }).stackUpdates = [];
    (window as unknown as { api: unknown }).api = {
      sourceControl: { retargetPrStack: async (args: unknown) => {
        (window as unknown as { stackUpdates: unknown[] }).stackUpdates.push(args);
        return conflict ? { ok: false, updated: [], stderr: "Merge conflict" } : { ok: true, updated: [2], stderr: "" };
      } }, shell: { openExternal: async ({ url }: { url: string }) => { (window as unknown as { lastStackUrl: string }).lastStackUrl = url; } },
    };
    createRoot(host).render(React.createElement(PullRequestStackNotice, {
      cwd: "/tmp/pr-stack", stack: { current: 2, position: 2, total: 3, parent, children: [child], members: [parent, current, child] },
    }));
    await document.fonts.ready;
  }, { language, theme, conflict });
}

for (const [language, theme] of [["en", "light"], ["ko", "dark"]] as const) {
  for (const width of [1440, 1024]) {
    test(`stack links and containment ${language} ${theme} ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await mount(page, language, theme);
      const stack = page.locator("[data-pr-stack]");
      await expect(stack).toContainText(language === "en" ? "2 of 3 in stack" : "스택 3개 중 2번째");
      await stack.getByRole("button", { name: language === "en" ? "Parent #1" : "상위 PR #1" }).click();
      expect(await page.evaluate(() => (window as unknown as { lastStackUrl: string }).lastStackUrl)).toBe("https://example.test/pull/1");
      await stack.getByRole("button", { name: language === "en" ? "Child #3" : "하위 PR #3" }).click();
      expect(await page.evaluate(() => (window as unknown as { lastStackUrl: string }).lastStackUrl)).toBe("https://example.test/pull/3");
      expect(await stack.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      await mkdir("/tmp/gap-h2/after", { recursive: true });
      await page.screenshot({ path: `/tmp/gap-h2/after/stack-${language}-${theme}-${width}.png` });
      await stack.getByRole("button", { name: language === "en" ? "Retarget and update children" : "하위 PR 대상 변경 및 업데이트" }).click();
      expect(await page.evaluate(() => (window as unknown as { stackUpdates: unknown[] }).stackUpdates)).toEqual([{ cwd: "/tmp/pr-stack", parentNumber: 1, childNumbers: [2] }]);
    });
  }
}

test("stack conflicts stay visible", async ({ page }) => {
  await mount(page, "en", "light", true);
  await page.getByRole("button", { name: "Retarget and update children" }).click();
  await expect(page.getByRole("alert")).toContainText("Merge conflict");
});

test("stack creation explicitly chooses the parent branch", async ({ page }) => {
  await page.goto("/?stavePreview=command-palette");
  await page.evaluate(async () => {
    const reactModule = await import("/node_modules/.vite/deps/react.js");
    const React = reactModule.default ?? reactModule;
    const domModule = await import("/node_modules/.vite/deps/react-dom_client.js");
    const { createRoot } = domModule.default ?? domModule;
    const { i18n } = await import("/src/i18n/index.ts");
    const { StackedPullRequestBranchFields } = await import("/src/components/layout/pull-request/StackedPullRequestBranchFields.tsx");
    await i18n.changeLanguage("en");
    document.body.replaceChildren();
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    let stacked = false;
    function render() {
      root.render(React.createElement(StackedPullRequestBranchFields, { disabled: false, branch: {
        currentBranch: "feature/child", defaultBranch: "main", targetBranch: "feature/base", options: ["main", "feature/base"], loading: false,
        stacked, parentNumber: 1, onStackedChange: (checked: boolean) => { stacked = checked; render(); }, onTargetBranchChange: () => {},
      } }));
    }
    render();
  });
  const choice = page.getByRole("checkbox", { name: "Create stacked PR", exact: true });
  await expect(choice).not.toBeChecked();
  await choice.check();
  await expect(choice).toBeChecked();
  await expect(page.getByRole("status")).toHaveText("Parent #1 on feature/base");
});
