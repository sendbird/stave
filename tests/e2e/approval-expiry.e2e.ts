import { expect, test, type Page } from "@playwright/test";

/**
 * A pending approval says when the runtime will deny it if nobody answers,
 * as a wall-clock time from the request's `expiresAt`: on the card beside the
 * decisions and in the composer row's details. A request without a deadline
 * ahead (no timer, or already passed) shows nothing. The clock is fixed so
 * the deadline is ahead of "now" and the rendered time is stable.
 */
test.use({ timezoneId: "UTC" });

const NOW = new Date("2026-11-03T15:39:00.000Z");
const DEADLINE = "2026-11-03T16:24:00.000Z";

const COPY = {
  en: { line: "Auto-denies at 4:24 PM if nobody answers", details: "Show details" },
  ko: { line: "응답이 없으면 오후 4:24에 자동으로 거부합니다", details: "세부 정보 표시" },
} as const;

async function seed(page: Page, locale: "en" | "ko") {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(() => {
    const path = "/tmp/stave-expiry";
    const workspace = { id: "ws-expiry", name: "expiry", updatedAt: "2026-11-03T01:00:00.000Z" };
    window.localStorage.setItem("stave:workspace-fallback:v1", JSON.stringify([{ ...workspace, snapshot: { activeTaskId: "", tasks: [], messagesByTask: {} } }]));
    window.localStorage.setItem("stave-store", JSON.stringify({ state: {
      repositoryPath: path, repositoryName: "stave-expiry", workspaces: [workspace], activeWorkspaceId: workspace.id,
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
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(async ({ locale, deadline }) => {
    const { applyAppLocale } = await import("/src/i18n/index.ts");
    applyAppLocale(locale);
    const { useAppStore } = await import("/src/store/app.store.ts");
    const approval = (requestId: string, description: string, expiresAt?: string) => ({
      type: "approval" as const, requestId, toolName: "Bash", description, input: `echo ${requestId}`,
      ...(expiresAt ? { expiresAt } : {}), state: "approval-requested" as const,
    });
    useAppStore.setState((state) => ({
      workspaces: [{ id: "ws-expiry", name: "expiry", updatedAt: "2026-11-03T01:00:00.000Z" }],
      settings: { ...state.settings, trustedTools: [] },
      tasks: [{ id: "task-expiry", title: "Expiry", provider: "codex", updatedAt: "2026-11-03T01:00:00.000Z", unread: false, archivedAt: null }],
      activeTaskId: "task-expiry", openTaskTabIds: ["task-expiry"],
      messagesByTask: { "task-expiry": [{
        id: "m-expiry", role: "assistant", model: "gpt-5.5", providerId: "codex", content: "", turnId: "turn-expiry",
        parts: [
          // No timer reported the deadline: nothing to say.
          approval("no-deadline", "Read the lockfile"),
          // The deadline already passed: nothing to promise.
          approval("passed", "List the build output", "2026-11-03T15:00:00.000Z"),
          approval("expiring", "Run the type check", deadline),
        ],
      }] },
      activeTurnIdsByTask: { "task-expiry": "turn-expiry" },
      taskWorkspaceIdById: { "task-expiry": "ws-expiry" },
    }) as never);
    await document.fonts.ready;
  }, { locale, deadline: DEADLINE });
  await expect(page.locator("html")).toHaveAttribute("lang", locale === "ko" ? "ko-KR" : "en-US");
}

/** The reply's steps are folded under its summary line; open them to reach the cards. */
async function openReplySteps(page: Page) {
  const summary = page.locator("button[aria-expanded]").filter({ hasText: /Finished|완료/ }).first();
  await expect(summary).toBeVisible();
  if ((await summary.getAttribute("aria-expanded")) !== "true") await summary.click();
}

const card = (page: Page, requestId: string) => page.locator(`section[data-approval-request-id="${requestId}"]`);

for (const locale of ["en", "ko"] as const) {
  test(`a pending approval says when it is denied if nobody answers (${locale})`, async ({ page }, testInfo) => {
    await seed(page, locale);
    await openReplySteps(page);

    const expiring = card(page, "expiring");
    await expect(expiring).toBeVisible();
    const line = expiring.locator("[data-approval-expiry]");
    await expect(line).toHaveText(COPY[locale].line);
    await expect(line.locator("time")).toHaveAttribute("datetime", DEADLINE);
    // It sits with the decisions, after Deny, inside the card.
    const deny = expiring.getByRole("button", { name: locale === "ko" ? "거부" : "Deny" });
    const [lineBox, denyBox, cardBox] = await Promise.all([line.boundingBox(), deny.boundingBox(), expiring.boundingBox()]);
    expect(lineBox!.x).toBeGreaterThanOrEqual(denyBox!.x + denyBox!.width);
    expect(lineBox!.x + lineBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 1);
    await expiring.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`approval-expiry-card-${locale}.png`) });

    await expect(card(page, "no-deadline").locator("[data-approval-expiry]")).toHaveCount(0);
    await expect(card(page, "passed").locator("[data-approval-expiry]")).toHaveCount(0);

    // The composer row shows the latest request; its details carry the same line.
    const row = page.getByTestId("composer-approval-row");
    await expect(row.locator('[data-approval-request-id="expiring"]')).toBeVisible();
    await expect(row.locator("[data-approval-expiry]")).toHaveCount(0);
    await row.getByTestId("composer-approval-details-toggle").click();
    await expect(row.locator("[data-approval-expiry]")).toHaveText(COPY[locale].line);
  });
}
