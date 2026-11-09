import { expect, test, type Page } from "@playwright/test";

/** Bottom-right workspace notices avoid controls; general notices stay top-center. */

type Locale = "en" | "ko";

const REGION: Record<Locale, string> = { en: "Notifications", ko: "알림" };

/** `--aui-space-20`: the stack's gap from the window edge and from what it clears. */
const GAP_PX = 20;

async function seedShell(page: Page, locale: Locale) {
  await page.addInitScript((language) => {
    const workspaceSnapshot = {
      activeTaskId: "task-toast",
      openTaskTabIds: ["task-toast"],
      activeSurface: { kind: "task", taskId: "task-toast" },
      tasks: [
        {
          id: "task-toast",
          title: "Toast placement",
          provider: "claude-code",
          updatedAt: "2026-07-24T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { "task-toast": [] },
    };
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([{ id: "ws-main", name: "main", updatedAt: "2026-07-24T00:00:00.000Z", snapshot: workspaceSnapshot }]),
    );
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          repositoryPath: "/tmp/stave-project",
          repositoryName: "stave-project",
          workspaces: [{ id: "ws-main", name: "main", updatedAt: "2026-07-24T00:00:00.000Z" }],
          activeWorkspaceId: "ws-main",
          workspaceBranchById: { "ws-main": "main" },
          workspacePathById: { "ws-main": "/tmp/stave-project" },
          workspaceDefaultById: { "ws-main": true },
          // Developer mode keeps the status bar on screen with no usage
          // provider connected, so the stack has a bar to clear.
          settings: { language, developerModeEnabled: true },
          ...workspaceSnapshot,
        },
        version: 0,
      }),
    );
    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: {
        streamTurn: async () => [],
        getCodexModelCatalog: async () => ({ ok: true, models: [], detail: "" }),
      },
      terminal: { runCommand: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }) },
      sourceControl: {
        getStatus: async () => ({ ok: true, branch: "main", items: [], hasConflicts: false, stderr: "" }),
      },
    };
  }, locale);
}

/** One notification, one pinned workspace result and one actionable error. */
async function raiseToasts(page: Page) {
  await page.evaluate(async () => {
    const modulePath = "/src/lib/notifications/toast.ts";
    const { toast } = await import(modulePath);
    toast.warning("Approval needed", { description: "Sort the Fleet table (2) · billing-table", duration: 0, position: "bottom-right" });
    toast.loading("Creating workspace…", { description: "feat/meter-primitive", position: "bottom-right" });
    toast.error("Check failed", {
      duration: 0,
      position: "bottom-right",
      description: "Open the task to inspect the result.",
      action: { label: "Open task", onClick: () => undefined },
    });
  });
}

type Box = { top: number; bottom: number; left: number; right: number };

function intersects(a: Box, b: Box) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const box = (element: Element): Box => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
    };
    const toasts = [...document.querySelectorAll(".atelier-toast-stack")];
    const viewports = new Set(toasts.map((toast) => toast.parentElement));
    const composer = document.querySelector("[data-toast-avoid]:not(footer)");
    const statusBar = document.querySelector("footer[data-toast-avoid]");
    const viewport = toasts[0]?.parentElement ?? null;
    return {
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      hostCount: viewports.size,
      viewportZ: viewport ? Number(getComputedStyle(viewport).zIndex) : 0,
      viewport: viewport ? box(viewport) : null,
      toasts: toasts.map(box),
      composer: composer ? box(composer) : null,
      statusBar: statusBar ? box(statusBar) : null,
    };
  });
}

for (const { name, width, height } of [
  { name: "wide", width: 1440, height: 900 },
  { name: "narrow", width: 900, height: 700 },
]) {
  for (const locale of ["en", "ko"] as const) {
    test(`one bottom-right toast stack clears the composer and status bar (${name}, ${locale})`, async ({ page }) => {
      await seedShell(page, locale);
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await page.evaluate(() => document.fonts.ready);
      const composer = page.locator("[data-toast-avoid]:not(footer)");
      await expect(composer).toBeVisible();
      await expect(page.locator("footer[data-toast-avoid]")).toBeVisible();

      await raiseToasts(page);
      const region = page.getByRole("region", { name: REGION[locale] }).filter({ has: page.locator(".atelier-toast-stack") });
      await expect(region).toHaveCount(1);
      await expect(page.locator(".atelier-toast-stack")).toHaveCount(3);

      // The lift is applied a frame after the stack opens.
      await expect
        .poll(async () => {
          const { toasts, composer: box } = await measure(page);
          return box ? Math.max(...toasts.map((toast) => toast.bottom)) <= box.top : false;
        })
        .toBe(true);

      const geometry = await measure(page);
      expect(geometry.hostCount).toBe(1);
      // Anchored to the inline end with the usual gap.
      expect(Math.abs(geometry.windowWidth - geometry.viewport!.right - GAP_PX)).toBeLessThanOrEqual(1);
      // Its gap is measured from the composer's top edge, not the window's bottom.
      expect(Math.abs(geometry.composer!.top - geometry.viewport!.bottom - GAP_PX)).toBeLessThanOrEqual(1);
      for (const toast of geometry.toasts) {
        expect(intersects(toast, geometry.composer!)).toBe(false);
        expect(intersects(toast, geometry.statusBar!)).toBe(false);
        expect(toast.top).toBeGreaterThanOrEqual(0);
        expect(toast.right).toBeLessThanOrEqual(geometry.windowWidth);
      }
      // A Lens page is a DOM element on band 10 (its pane chrome on 15): the
      // stack must paint over it rather than hide under it.
      expect(geometry.viewportZ).toBeGreaterThan(15);
    });
  }
}

test("the stack follows the composer as it grows and drops back once the toasts close", async ({ page }) => {
  await seedShell(page, "en");
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto("/");
  const composer = page.locator("[data-toast-avoid]:not(footer)");
  await expect(composer).toBeVisible();
  await raiseToasts(page);
  await expect(page.locator(".atelier-toast-stack")).toHaveCount(3);
  const before = await measure(page);

  const editor = composer.getByRole("textbox").first();
  await editor.click();
  for (let line = 0; line < 5; line += 1) {
    await page.keyboard.type(`line ${line + 1}`);
    await page.keyboard.press("Shift+Enter");
  }
  await expect
    .poll(async () => (await measure(page)).composer!.top)
    .toBeLessThan(before.composer!.top - 40);
  await expect
    .poll(async () => {
      const { viewport, composer: box } = await measure(page);
      return Math.round(box!.top - viewport!.bottom);
    })
    .toBe(GAP_PX);

  await page.evaluate(async () => {
    const modulePath = "/src/lib/notifications/toast.ts";
    const { toast } = await import(modulePath);
    toast.dismiss();
  });
  await expect(page.locator(".atelier-toast-stack")).toHaveCount(0);
  // With nothing open the host stops measuring; the next toast measures anew.
  await raiseToasts(page);
  await expect
    .poll(async () => {
      const { viewport, composer: box } = await measure(page);
      return Math.round(box!.top - viewport!.bottom);
    })
    .toBe(GAP_PX);
});

test("in Fleet view the stack stays clear of the Action required band", async ({ page }) => {
  await seedShell(page, "en");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByTestId("top-bar").getByRole("button", { name: "Open Fleet View" }).click();
  const band = page.locator("[data-fleet-inbox-band]");
  await expect(band).toBeVisible();
  await raiseToasts(page);
  await expect(page.locator(".atelier-toast-stack")).toHaveCount(3);
  await expect
    .poll(async () => {
      const { toasts, statusBar } = await measure(page);
      return toasts.every((toast) => !intersects(toast, statusBar!));
    })
    .toBe(true);
  const bandBox = (await band.boundingBox())!;
  const { toasts, viewport, windowWidth } = await measure(page);
  expect(Math.abs(windowWidth - viewport!.right - GAP_PX)).toBeLessThanOrEqual(1);
  for (const toast of toasts) {
    expect(toast.top).toBeGreaterThanOrEqual(bandBox.y + bandBox.height);
  }
});

test("collapsed, the newest toast stays in front of the older ones", async ({ page }) => {
  await seedShell(page, "en");
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("[data-toast-avoid]:not(footer)")).toBeVisible();
  await page.evaluate(async () => {
    const modulePath = "/src/lib/notifications/toast.ts";
    const { toast } = await import(modulePath);
    toast.loading("Creating workspace…", { description: "feat/meter-primitive", position: "bottom-right" });
    toast.warning("Approval needed", { description: "Sort the Fleet table (2) · billing-table", duration: 0, position: "bottom-right" });
  });
  await expect(page.locator(".atelier-toast-stack")).toHaveCount(2);
  // Keep the pointer away so the stack stays collapsed.
  await page.mouse.move(5, 5);
  await expect(page.locator(".atelier-toast-stack[data-expanded]")).toHaveCount(0);
  const newest = page.locator(".atelier-toast-stack", { hasText: "Approval needed" });
  await expect
    .poll(async () =>
      newest.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return Boolean(hit && element.contains(hit));
      }),
    )
    .toBe(true);
});

for (const width of [900, 1440]) {
  for (const locale of ["en", "ko"] as const) {
    for (const dark of [false, true]) {
      for (const density of ["regular", "compact"]) {
        test(`top-center long notice stays contained (${width}, ${locale}, ${dark}, ${density})`, async ({ page }) => {
          await seedShell(page, locale);
          await page.setViewportSize({ width, height: 900 });
          await page.goto("/");
          await expect(page.locator("[data-toast-avoid]:not(footer)")).toBeVisible();
          await page.evaluate(async ({ locale, dark, density }) => {
            document.documentElement.classList.toggle("dark", dark);
            document.documentElement.dataset.uiDensity = density;
            const { toast } = await import("/src/lib/notifications/toast.ts");
            toast.warning(locale === "ko" ? "입력이 필요합니다 — 서비스 요금제를 검토해 주세요" : "Input needed — Review service subscription tiers", {
              duration: 0,
              description: (locale === "ko" ? "서비스 재개는 완료됐습니다. 후속 수정은 별도 PR로 검토해 주세요. " : "Service has resumed. Please review the follow-up change in a separate pull request. ") + "https://example.com/review/" + "long-identifier".repeat(15),
              action: { label: locale === "ko" ? "작업 열기" : "Open task", onClick: () => { document.documentElement.dataset.toastOpened = "true"; } },
            });
            await document.fonts.ready;
          }, { locale, dark, density });
          const card = page.locator(".atelier-toast-stack");
          await expect(card).toBeVisible();
          await expect.poll(() => card.evaluate((element) => Math.round(element.getBoundingClientRect().top))).toBe(density === "compact" ? 16 : GAP_PX);
          const geometry = await card.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            const title = element.querySelector('[data-aui-slot="title"]') ?? element.querySelector("h2");
            const close = element.querySelector('button[aria-label]')!;
            const copy = title!.parentElement!;
            const description = copy.lastElementChild!;
            const icon = element.querySelector("svg")!;
            const titleBox = title!.getBoundingClientRect();
            const glyph = icon.getBoundingClientRect();
            return {
              center: rect.left + rect.width / 2,
              copyRight: copy.getBoundingClientRect().right,
              closeLeft: close.getBoundingClientRect().left,
              closeWidth: close.getBoundingClientRect().width,
              copyOverflow: copy.scrollWidth - copy.clientWidth,
              descriptionOverflow: description.scrollWidth - description.clientWidth,
              firstLineDelta: glyph.top + glyph.height / 2 - titleBox.top - parseFloat(getComputedStyle(title!).lineHeight) / 2,
              background: getComputedStyle(element).backgroundColor,
            };
          });
          expect(Math.abs(geometry.center - width / 2)).toBeLessThanOrEqual(1);
          expect(geometry.copyRight).toBeLessThan(geometry.closeLeft);
          expect(geometry.closeWidth).toBeGreaterThanOrEqual(24);
          expect(geometry.copyOverflow).toBeLessThanOrEqual(1);
          expect(geometry.descriptionOverflow).toBeLessThanOrEqual(1);
          expect(Math.abs(geometry.firstLineDelta)).toBeLessThanOrEqual(1);
          expect(geometry.background).not.toBe("rgba(0, 0, 0, 0)");
          await card.getByRole("button", { name: locale === "ko" ? "작업 열기" : "Open task" }).click();
          await expect(card).toHaveCount(0);
          await expect(page.locator("html")).toHaveAttribute("data-toast-opened", "true");
        });
      }
    }
  }
}
