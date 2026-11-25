import { expect, test, type Page } from "@playwright/test";

type Win = Window & Record<string, unknown>;

const pr = (number: number, head: string, base: string, state: string, author = "me", sameRepository = true) => ({
  number, title: `Change ${number}`, headRefName: head, baseRefName: base, state, url: `https://example.test/team/repo/pull/${number}`,
  createdAt: "2026-11-17T00:00:00Z", mergedAt: state === "MERGED" ? "2026-11-17T00:30:00Z" : null, author, sameRepository,
});
const parent = pr(1, "feature/base", "main", "MERGED");
const current = pr(2, "feature/child", "feature/base", "OPEN");
const sibling = pr(5, "feature/sibling", "feature/base", "OPEN");
const leaf = pr(3, "feature/leaf", "feature/child", "OPEN");
const theirs = pr(4, "feature/theirs", "feature/base", "OPEN", "other");
const STACK = {
  current: 2, position: 2, total: 3, parent, children: [leaf], members: [parent, current, leaf],
  retarget: { parent, toBase: "main", children: [current, sibling], excluded: [{ pr: theirs, reason: "not-yours" }] },
};

/** Mounts the real components against a scripted `window.api`. */
async function mount(page: Page, options: { language?: string; theme?: string; script: string; render: string }) {
  await page.goto("/?stavePreview=command-palette");
  await page.evaluate(async ({ language, theme, script, render, stack }) => {
    const reactModule = await import("/node_modules/.vite/deps/react.js");
    const React = reactModule.default ?? reactModule;
    const domModule = await import("/node_modules/.vite/deps/react-dom_client.js");
    const { createRoot } = domModule.default ?? domModule;
    const { i18n } = await import("/src/i18n/index.ts");
    const modules = {
      ...(await import("/src/components/layout/pull-request/PullRequestStackNotice.tsx")),
      ...(await import("/src/components/layout/pull-request/PullRequestStackSlot.tsx")),
      ...(await import("/src/components/layout/pull-request/use-pull-request-stack.ts")),
    };
    await i18n.changeLanguage(language);
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.body.replaceChildren();
    const host = document.createElement("div");
    host.id = "stack-host";
    document.body.append(host);
    const w = window as unknown as Record<string, unknown>;
    w.stack = stack; w.React = React; w.modules = modules;
    w.root = createRoot(host);
    new Function(script)();
    new Function(render)();
    await document.fonts.ready;
  }, { language: options.language ?? "en", theme: options.theme ?? "light", script: options.script, render: options.render, stack: STACK });
}

const slotRender = `const w = window; w.root.render(w.React.createElement(w.modules.PullRequestStackSlot, { cwd: "/tmp/pr-stack", branch: "feature/child", enabled: true, revision: "2:OPEN:feature/base" }));`;
const retargetScript = (responses: unknown[]) => `
  const w = window; w.calls = []; const responses = ${JSON.stringify(responses)};
  w.api = { sourceControl: {
    getPrStack: async () => ({ ok: true, stack: w.stack, code: null }),
    retargetPrStack: async (args) => { w.calls.push(args); return responses[w.calls.length - 1]; },
  }, shell: { openExternal: async ({ url }) => { w.lastUrl = url; } } };`;

for (const [language, theme] of [["en", "light"], ["ko", "dark"]] as const) {
  for (const width of [1440, 1024]) {
    test(`stack links and containment ${language} ${theme} ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await mount(page, { language, theme, script: retargetScript([]), render: `const w = window; document.getElementById("stack-host").style.width = "240px"; w.root.render(w.React.createElement(w.modules.PullRequestStackNotice, { stack: w.stack, onRetarget() {} }));` });
      const stack = page.locator("[data-pr-stack]");
      await expect(stack).toContainText(language === "en" ? "2 of 3 in stack" : "스택 3개 중 2번째");
      await stack.getByRole("button", { name: language === "en" ? "Parent #1" : "상위 PR #1" }).click();
      expect(await page.evaluate(() => (window as unknown as Win).lastUrl)).toBe(parent.url);
      await stack.getByRole("button", { name: language === "en" ? "Child #3" : "하위 PR #3" }).click();
      expect(await page.evaluate(() => (window as unknown as Win).lastUrl)).toBe(leaf.url);
      expect(await stack.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    });
  }
}

test("the top bar shows the position once: the menu notice can hide it", async ({ page }) => {
  await mount(page, { script: retargetScript([]), render: `const w = window; w.root.render(w.React.createElement(w.modules.PullRequestStackNotice, { stack: w.stack, showPosition: false, onRetarget() {} }));` });
  await expect(page.locator("[data-pr-stack]")).not.toContainText("2 of 3 in stack");
});

test("retargeting lists the exact changes, confirms, and recovers per child", async ({ page }) => {
  await mount(page, { script: retargetScript([
    { ok: false, code: null, results: [{ number: 2, status: "updated", reason: null }, { number: 5, status: "skipped", reason: "edit-failed" }] },
    { ok: true, code: null, results: [{ number: 5, status: "updated", reason: null }] },
  ]), render: slotRender });
  await page.getByRole("button", { name: "Retarget children…" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("#2 Change 2");
  await expect(dialog).toContainText("feature/base → main");
  await expect(dialog).toContainText("by me");
  await expect(dialog.locator("[data-retarget-excluded='4']")).toContainText("Not yours");
  // The dialog is not part of the notice, so a menu hosting the notice can close without losing it.
  expect(await page.evaluate(() => Boolean(document.querySelector("[data-pr-stack] [data-pr-stack-retarget]")))).toBe(false);
  expect(await page.evaluate(() => (window as unknown as Win).calls)).toEqual([]);
  await dialog.getByRole("button", { name: "Retarget 2 pull requests" }).click();
  await expect(dialog.locator("[data-retarget-child='2']")).toContainText("now targets the new base");
  await expect(dialog.locator("[data-retarget-child='5']")).toContainText("GitHub did not accept the new base");
  await dialog.getByRole("button", { name: "Retry 1 remaining" }).click();
  await expect(dialog.locator("[data-retarget-child='5']")).toContainText("now targets the new base");
  await expect(dialog.getByRole("button", { name: /Retry|Retarget/ })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as Win).calls)).toEqual([
    { cwd: "/tmp/pr-stack", parentNumber: 1, parentUrl: parent.url, children: [{ number: 2, fromBase: "feature/base", toBase: "main" }, { number: 5, fromBase: "feature/base", toBase: "main" }], longLivedBranchPatterns: ["main", "master", "develop", "staging", "release/*"] },
    { cwd: "/tmp/pr-stack", parentNumber: 1, parentUrl: parent.url, children: [{ number: 5, fromBase: "feature/base", toBase: "main" }], longLivedBranchPatterns: ["main", "master", "develop", "staging", "release/*"] },
  ]);
});

test("conflicts and host errors are shown as translated reasons", async ({ page }) => {
  await mount(page, { language: "ko", script: retargetScript([
    { ok: false, code: null, results: [{ number: 2, status: "conflict", reason: "merge-conflict" }, { number: 5, status: "skipped", reason: "not-yours" }] },
  ]), render: slotRender });
  await page.getByRole("button", { name: "하위 PR 대상 변경…" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "PR 2개 대상 변경" }).click();
  await expect(dialog.locator("[data-retarget-child='2']")).toContainText("충돌을 해결한 뒤");
  await expect(dialog.locator("[data-retarget-child='5']")).toContainText("다른 사람이 연 PR입니다.");
  await expect(dialog).not.toContainText("merge-conflict");
});

test("refreshing the same PR keeps the stack on screen", async ({ page }) => {
  await mount(page, {
    script: `const w = window; w.reads = 0; w.api = { sourceControl: { getPrStack: async () => { w.reads += 1; await new Promise(r => setTimeout(r, 300)); return { ok: true, stack: w.stack, code: null }; } } };`,
    render: `const w = window; const { usePullRequestStack } = w.modules; const React = w.React;
      function Probe(props) { const s = usePullRequestStack({ cwd: "/tmp/pr-stack", enabled: true, revision: props.revision }); return React.createElement(w.modules.PullRequestStackNotice, { stack: s.stack }); }
      w.renderProbe = (revision) => w.root.render(React.createElement(Probe, { revision }));
      w.renderProbe(1);`,
  });
  await expect(page.locator("[data-pr-stack]")).toBeVisible();
  await page.evaluate(() => {
    const w = window as unknown as Win & { renderProbe: (revision: number) => void; vanished: boolean };
    w.vanished = false;
    new MutationObserver(() => { if (!document.querySelector("[data-pr-stack]")) w.vanished = true; }).observe(document.body, { childList: true, subtree: true });
    w.renderProbe(2);
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).reads)).toBe(2);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => (window as unknown as Win).vanished)).toBe(false);
});

test("Fleet stack reads run two at a time and only for cards on screen", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await mount(page, {
    script: `const w = window; w.active = 0; w.peak = 0; w.reads = [];
      w.api = { sourceControl: { getPrStack: async ({ branch }) => { w.reads.push(branch); w.active += 1; w.peak = Math.max(w.peak, w.active); await new Promise(r => setTimeout(r, 150)); w.active -= 1; return { ok: true, stack: null, code: null }; } } };`,
    render: `const w = window; const React = w.React;
      w.root.render(React.createElement("div", { style: { height: "300px", overflow: "auto" }, id: "fleet-scroll" },
        Array.from({ length: 10 }, (_, i) => React.createElement("div", { key: i, style: { height: "120px" } },
          React.createElement(w.modules.PullRequestStackSlot, { cwd: "/tmp/ws" + i, branch: "b" + i, enabled: true, revision: i + ":OPEN:main" })))));`,
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as Win & { reads: string[] }).reads.length)).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  const visible = await page.evaluate(() => (window as unknown as Win & { reads: string[] }).reads.slice());
  expect(visible.length).toBeLessThan(10);
  expect(visible).not.toContain("b9");
  await page.evaluate(() => { document.getElementById("fleet-scroll")!.scrollTop = 10_000; });
  await expect.poll(() => page.evaluate(() => (window as unknown as Win & { reads: string[] }).reads)).toContain("b9");
  expect(await page.evaluate(() => (window as unknown as Win).peak)).toBeLessThanOrEqual(2);
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


/** The real top bar PR area against an in-memory bridge with an open, stacked PR. */
async function installStackHarness(page: Page) {
  await page.addInitScript(() => {
    const pr = (number: number, head: string, base: string, state: string, author = "me") => ({
      number, title: `Change ${number}`, headRefName: head, baseRefName: base, state, url: `https://example.test/pull/${number}`,
      createdAt: "2026-11-17T00:00:00Z", mergedAt: state === "MERGED" ? "2026-11-17T00:30:00Z" : null, author, sameRepository: true,
    });
    const parent = pr(1, "feature-base", "main", "MERGED");
    const current = pr(2, "feature-pr", "feature-base", "OPEN");
    const leaf = pr(3, "feature-leaf", "feature-pr", "OPEN");
    const w = window as unknown as Record<string, unknown>;
    const harness = { stackReads: 0, retargets: [] as unknown[] };
    w.__prHarness = harness;
    w.api = {
      provider: {}, terminal: {}, scripts: {}, shell: { openExternal: async () => undefined },
      sourceControl: {
        getPrStatus: async () => ({ ok: true, stderr: "", pr: {
          number: 2, title: "Change 2", state: "OPEN", isDraft: false, url: "https://example.test/pull/2", reviewDecision: null,
          mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", checksRollup: "SUCCESS", mergedAt: null, baseRefName: "feature-base", headRefName: "feature-pr",
        } }),
        getStatus: async () => ({ ok: true, branch: "feature-pr", items: [], hasConflicts: false, stderr: "" }),
        getPrStack: async () => {
          harness.stackReads += 1;
          return { ok: true, code: null, stack: { current: 2, position: 2, total: 3, parent, children: [leaf], members: [parent, current, leaf],
            retarget: { parent, toBase: "main", children: [current], excluded: [] } } };
        },
        retargetPrStack: async (args: unknown) => {
          harness.retargets.push(args);
          return { ok: false, code: null, results: [{ number: 2, status: "conflict", reason: "merge-conflict" }] };
        },
      },
    };
  });
}

for (const [lang, theme] of [["en", "light"], ["ko", "dark"]] as const) {
  test(`top bar: one position label, retarget dialog outlives the menu (${lang})`, async ({ page }) => {
    await installStackHarness(page);
    await page.goto(`/?stavePreview=create-pr&theme=${theme}&lang=${lang}`);
    await page.evaluate(async (language) => { const { i18n } = await import("/src/i18n/index.ts"); await i18n.changeLanguage(language); }, lang);
    const position = lang === "ko" ? "스택 3개 중 2번째" : "2 of 3 in stack";
    await expect(page.getByText(position, { exact: true })).toHaveCount(1);
    await page.getByTestId("create-pr-preview").getByRole("button", { name: lang === "ko" ? /PR 상태/ : "Open PR status menu" }).click();
    const menu = page.getByRole("menu");
    await expect(menu.locator("[data-pr-stack]")).toBeVisible();
    // Opened from the menu, the position still appears once.
    await expect(page.getByText(position, { exact: true })).toHaveCount(1);
    await menu.getByRole("button", { name: lang === "ko" ? "하위 PR 대상 변경…" : "Retarget children…" }).click();
    await expect(menu).toHaveCount(0);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("feature-base → main");
    await dialog.getByRole("button", { name: lang === "ko" ? "PR 1개 대상 변경" : "Retarget 1 pull request" }).click();
    await expect(dialog.locator("[data-retarget-child='2']")).toContainText(lang === "ko" ? "충돌을 해결한 뒤" : "resolve the conflicts");
    expect(await page.evaluate(() => (window as unknown as { __prHarness: { retargets: unknown[] } }).__prHarness.retargets)).toHaveLength(1);
    // Status polling does not re-read the stack while the PR is unchanged.
    const reads = await page.evaluate(() => (window as unknown as { __prHarness: { stackReads: number } }).__prHarness.stackReads);
    expect(reads).toBeLessThanOrEqual(2);
  });
}
