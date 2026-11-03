import { expect, test, type Page } from "@playwright/test";

/**
 * Rendered geometry for the new approval and preset rows, on the real
 * product markup with resolved tokens:
 *
 * - a preset action row: its state mark sits on the label's first line, a
 *   token gap before the text, the state word on one line, nothing past the
 *   list's edge;
 * - the composer approval row: the risk word stays whole while the command
 *   truncates, and nothing leaves the row, wide and narrow;
 * - the approval card's meta row: the risk word and the status word share a
 *   baseline.
 */
async function seed(page: Page, args: { locale: "en" | "ko"; density: "regular" | "compact" }) {
  await page.addInitScript(() => {
    const path = "/tmp/stave-geometry";
    const workspace = { id: "ws-geometry", name: "geometry", updatedAt: "2026-11-03T01:00:00.000Z" };
    window.localStorage.setItem("stave:workspace-fallback:v1", JSON.stringify([{ ...workspace, snapshot: { activeTaskId: "", tasks: [], messagesByTask: {} } }]));
    window.localStorage.setItem("stave-store", JSON.stringify({ state: {
      repositoryPath: path, repositoryName: "stave-geometry", workspaces: [workspace], activeWorkspaceId: workspace.id,
      workspaceBranchById: { [workspace.id]: "main" }, workspacePathById: { [workspace.id]: path },
      workspaceDefaultById: { [workspace.id]: true }, activeTaskId: "", tasks: [], messagesByTask: {},
    }, version: 0 }));
    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: { streamTurn: async () => [], respondApproval: async () => ({ ok: true }) },
      terminal: { runCommand: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }) },
      sourceControl: {
        getStatus: async () => ({ ok: true, branch: "main", items: [], hasConflicts: false, stderr: "" }),
        getHistory: async () => ({ ok: true, items: [], stderr: "" }),
      },
    };
  });
  await page.setViewportSize({ width: 1600, height: 960 });
  await page.goto("/");
  await page.evaluate(async ({ locale, density }) => {
    const { applyAppLocale } = await import("/src/i18n/index.ts");
    applyAppLocale(locale);
    document.documentElement.dataset.uiDensity = density;
    const { useAppStore } = await import("/src/store/app.store.ts");
    useAppStore.setState((state) => ({
      workspaces: [{ id: "ws-geometry", name: "geometry", updatedAt: "2026-11-03T01:00:00.000Z" }],
      settings: {
        ...state.settings,
        claudePermissionMode: "acceptEdits", claudeAllowDangerouslySkipPermissions: false,
        claudeSandboxEnabled: false, claudeAllowUnsandboxedCommands: true,
      },
      tasks: [{ id: "task-geometry", title: "Geometry", provider: "claude-code", updatedAt: "2026-11-03T01:00:00.000Z", unread: false, archivedAt: null }],
      activeTaskId: "task-geometry", openTaskTabIds: ["task-geometry"],
      messagesByTask: { "task-geometry": [{
        id: "m-geometry", role: "assistant", model: "claude-sonnet-4-5", providerId: "claude-code", content: "", turnId: "turn-geometry",
        parts: [{
          type: "approval", requestId: "geometry-1", toolName: "Bash", description: "Fetch the package index",
          input: "curl https://registry.npmjs.org/react --header 'accept: application/json' --silent --show-error",
          supportsAllowAlways: true, trustedToolEntry: "bash:curl https://registry.npmjs.org/react", risk: "network-access",
          state: "approval-requested",
        }],
      }] },
      activeTurnIdsByTask: { "task-geometry": "turn-geometry" },
      taskWorkspaceIdById: { "task-geometry": "ws-geometry" },
    }) as never);
    await document.fonts.ready;
  }, args);
  await expect(page.locator("html")).toHaveAttribute("lang", args.locale === "ko" ? "ko-KR" : "en-US");
}

for (const locale of ["en", "ko"] as const) {
  for (const density of ["regular", "compact"] as const) {
    test(`preset action rows keep the mark on the first line and the word whole: ${locale}/${density}`, async ({ page }) => {
      await seed(page, { locale, density });
      const guided = await page.evaluate(async () => {
        const { i18n } = await import("/src/i18n/index.ts");
        return i18n.t("providers:providerModePresets.guided");
      });
      // The permission preset control, not the model picker that also starts with "Claude".
      const pill = page.locator(`button[aria-label^="Claude ${guided}:"]`).first();
      await pill.click();
      const list = page.locator("[data-preset-actions]").first();
      await expect(list).toBeVisible();
      // Measure once the menu's opening motion has settled.
      await list.evaluate((element) =>
        Promise.all(document.getAnimations().filter((animation) =>
          animation.effect instanceof KeyframeEffect &&
          animation.effect.target instanceof Node &&
          animation.effect.target.contains(element)).map((animation) => animation.finished)));
      const worst = await list.evaluate(async (element) => {
        const { vars } = await import("/src/components/ads/tokens/tokens.stylex.ts");
        const probe = document.createElement("div");
        probe.style.columnGap = vars["--ads-space-8"];
        element.append(probe);
        const gap = Number.parseFloat(getComputedStyle(probe).columnGap);
        probe.remove();
        const box = element.getBoundingClientRect();
        const deltas: number[] = [];
        for (const row of element.querySelectorAll("li")) {
          // The drawn state mark inside its slot.
          const mark = row.querySelector("[data-state]")!.getBoundingClientRect();
          // The label is the first line of the text column, after the mark slot.
          const label = row.children[1]!.firstElementChild!;
          const labelBox = label.getBoundingClientRect();
          const lineHeight = Number.parseFloat(getComputedStyle(label).lineHeight);
          const word = row.lastElementChild!;
          const wordBox = word.getBoundingClientRect();
          const wordLine = Number.parseFloat(getComputedStyle(word).lineHeight);
          const text = row.children[1]!.getBoundingClientRect();
          deltas.push(
            Math.abs(mark.y + mark.height / 2 - (labelBox.y + lineHeight / 2)),
            Math.abs(text.left - mark.right - gap),
            Math.max(0, wordBox.height - wordLine),
            Math.max(0, wordBox.right - box.right, text.right - box.right),
          );
        }
        return { worst: Math.max(...deltas), deltas };
      });
      expect(worst.worst, JSON.stringify(worst.deltas)).toBeLessThanOrEqual(1);
    });

    test(`the composer row keeps the risk word whole and the command inside: ${locale}/${density}`, async ({ page }) => {
      await seed(page, { locale, density });
      const queue = page.getByRole("region", { name: /Approval queue|승인 대기열/ });
      await expect(queue).toBeVisible();
      for (const width of [1600, 760]) {
        await page.setViewportSize({ width, height: 960 });
        await expect.poll(() => queue.evaluate((section) => {
          const risk = section.querySelector<HTMLElement>("[data-approval-risk]")!;
          const summary = section.querySelector<HTMLElement>("code")!;
          const box = section.getBoundingClientRect();
          const overflow = [...section.querySelectorAll("button, code, span")]
            .map((node) => node.getBoundingClientRect().right - box.right)
            .reduce((max, value) => Math.max(max, value), 0);
          return Math.max(
            risk.scrollWidth - risk.clientWidth,
            getComputedStyle(summary).textOverflow === "ellipsis" ? 0 : 99,
            overflow,
          );
        })).toBeLessThanOrEqual(0.5);
      }
    });
  }
}

test("the approval card's risk word and status word share a baseline", async ({ page }) => {
  await seed(page, { locale: "en", density: "regular" });
  // The pending card lives in the reply's folded steps.
  await page.getByRole("button", { name: /Finished|Ran/ }).first().click();
  const card = page.locator('section[data-approval-request-id="geometry-1"]');
  await expect(card).toBeVisible();
  const delta = await card.evaluate((section) => {
    const risk = section.querySelector("[data-approval-risk]")!;
    const status = section.querySelector('[data-ads-slot="status"]')!;
    const baseline = (node: Element) => {
      const range = document.createRange();
      range.selectNodeContents(node.firstChild ?? node);
      return range.getBoundingClientRect().bottom;
    };
    return Math.abs(baseline(risk) - baseline(status));
  });
  expect(delta).toBeLessThanOrEqual(1);
});
