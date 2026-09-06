import { expect, test } from "@playwright/test";

test("ADS controls preserve saved exchanges, theme overrides and report actions", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?stavePreview=collaboration");
  const exportButton = page.getByRole("button", { name: "Export report" });
  await expect(exportButton).toHaveCSS("min-height", "28px");
  await expect(exportButton).toHaveCSS("font-size", "12px");
  await expect(exportButton).toHaveCSS("padding-left", "8px");
  await expect(
    page.getByRole("tablist", { name: "Collaboration sections" }),
  ).toHaveCount(0);
  await page.getByText("Execution details", { exact: true }).first().click();
  await expect(
    page.getByText(
      "Check cancellation ordering and return a focused regression test.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("selected-worker", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Worker preset", { exact: true })).toBeVisible();
  await expect(page.getByText("auto", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Does this change preserve restart behavior?", {
      exact: true,
    }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await exportButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("collaboration-report.md");
  await page.setViewportSize({ width: 360, height: 800 });
  const previewSurface = page.locator("main");
  const darkBackground = await previewSurface.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Light theme", exact: true }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expect
    .poll(() =>
      previewSurface.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    )
    .not.toBe(darkBackground);
  await expect(page.locator('div[data-theme="light"]')).not.toHaveClass(
    /atelier-theme-transition/,
  );
  await page.screenshot({
    path: testInfo.outputPath("collaboration-light-360.png"),
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(exportButton).toHaveCSS("padding-left", "8px");
  await expect(exportButton).toHaveAttribute("data-ads-control", "button");
  await page.evaluate(() =>
    document.documentElement.style.setProperty(
      "--muted-foreground",
      "rgb(21, 63, 91)",
    ),
  );
  await expect(exportButton).toHaveCSS("color", "rgb(21, 63, 91)");
  await page.evaluate(() =>
    document.documentElement.style.removeProperty("--muted-foreground"),
  );
  await page.getByRole("button", { name: "Dark theme", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect
    .poll(() =>
      previewSurface.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    )
    .toBe(darkBackground);
  await expect(page.locator('div[data-theme="dark"]')).not.toHaveClass(
    /atelier-theme-transition/,
  );
  await page.screenshot({
    path: testInfo.outputPath("collaboration-dark-360.png"),
  });
  expect(errors).toEqual([]);
});

test("delegation retries uncertain delivery with the same identity and explicit permissions", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const requests = JSON.parse(
      localStorage.getItem("test:delegation-requests") ?? "[]",
    ) as unknown[];
    const acknowledgedBeforeInvoke: boolean[] = [];
    Object.assign(window, {
      delegationRequests: requests,
      delegationAcknowledgements: acknowledgedBeforeInvoke,
      api: {
        runs: {
          listChildTasks: async () => [],
          delegateChildTask: async (args: { delegationKey?: string }) => {
            acknowledgedBeforeInvoke.push(
              Object.keys(localStorage)
                .filter((key) => key.startsWith("stave:delegation-draft:"))
                .some((key) => {
                  const saved = JSON.parse(localStorage.getItem(key) ?? "null");
                  return (
                    saved?.pendingRequest?.delegationKey === args.delegationKey
                  );
                }),
            );
            requests.push(args);
            localStorage.setItem(
              "test:delegation-requests",
              JSON.stringify(requests),
            );
            if (requests.length === 1) throw new Error("transport lost");
            return {
              accepted: true,
              duplicate: true,
              reason: null,
              message: null,
              child: null,
            };
          },
        },
      },
    });
  });
  await page.goto("/?stavePreview=collaboration");
  await page.locator("summary").filter({ hasText: "Delegate a task" }).click();
  await page
    .getByRole("textbox", { name: "Assignment", exact: true })
    .fill("Review persistence and return evidence.");
  await page
    .getByRole("combobox", { name: "Provider", exact: true })
    .selectOption("claude-code");
  await page.getByLabel("Model (optional)").fill("chosen-model");
  await page
    .getByRole("combobox", { name: "Permissions", exact: true })
    .selectOption("manual");
  await page
    .getByRole("checkbox", {
      name: "Use a separate Git worktree for file changes",
    })
    .uncheck();
  await page
    .getByRole("checkbox", {
      name: /^Keep available for follow-up after the first result/,
    })
    .uncheck();

  await expect(
    page.getByRole("textbox", { name: "Assignment", exact: true }),
  ).toHaveValue("Review persistence and return evidence.");
  await expect(page.getByLabel("Model (optional)")).toHaveValue("chosen-model");
  await expect(
    page.getByRole("combobox", { name: "Permissions", exact: true }),
  ).toHaveValue("manual");
  await expect(
    page.getByRole("checkbox", {
      name: "Use a separate Git worktree for file changes",
    }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("checkbox", {
      name: /^Keep available for follow-up after the first result/,
    }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Delegate task", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Delivery could not be confirmed",
  );
  await page.reload();
  await page.locator("summary").filter({ hasText: "Delegate a task" }).click();
  await expect(
    page.getByRole("textbox", { name: "Assignment", exact: true }),
  ).toHaveValue("Review persistence and return evidence.");
  await expect(page.getByRole("status")).toContainText(
    "Previous delivery was not confirmed",
  );
  await page
    .getByRole("button", { name: "Delegate task", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("already exists");
  const requests = await page.evaluate(
    () =>
      (
        window as unknown as {
          delegationRequests: Array<Record<string, unknown>>;
        }
      ).delegationRequests,
  );
  expect(requests).toHaveLength(2);
  expect(requests[0]).toEqual(requests[1]);
  expect(requests[0]).toMatchObject({
    providerId: "claude-code",
    model: "chosen-model",
    permissionProfile: "manual",
    lifecycle: "one-turn",
    workspace: { mode: "same-workspace" },
    parentTaskId: "preview-parent",
  });
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as {
            delegationAcknowledgements: boolean[];
          }
        ).delegationAcknowledgements,
    ),
  ).toEqual([true]);

  await page.reload();
  await page.locator("summary").filter({ hasText: "Delegate a task" }).click();
  await expect(
    page.getByRole("textbox", { name: "Assignment", exact: true }),
  ).toHaveValue("");
});

test("late listing replies cannot repopulate a disabled subscription", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const replies: Array<() => void> = [];
    Object.assign(window, {
      releaseListingReplies: () => replies.forEach((resolve) => resolve()),
      api: {
        runs: {
          listChildTasks: () =>
            new Promise((resolve) =>
              replies.push(() =>
                resolve([
                  {
                    runId: "r",
                    stepId: "s",
                    parentTaskId: "probe-parent",
                    delegationKey: "review",
                    childTaskId: "child",
                    childWorkspaceId: "workspace",
                    childTurnId: null,
                    providerId: "codex",
                    lifecycle: "detached",
                    phase: "waiting",
                    reason: null,
                    attempt: 0,
                    createdAt: "2026-01-01T00:00:00Z",
                    updatedAt: "2026-01-01T00:00:00Z",
                    completedAt: null,
                  },
                ]),
              ),
            ),
        },
      },
    });
  });
  await page.goto("/?stavePreview=collaboration&listingProbe=1");
  await expect(page.getByLabel("Listing pending")).toHaveText("true");
  await page.getByRole("button", { name: "Disable listing" }).click();
  await expect(page.getByLabel("Listing pending")).toHaveText("false");
  await page.evaluate(() =>
    (
      window as unknown as { releaseListingReplies: () => void }
    ).releaseListingReplies(),
  );
  await expect(page.getByLabel("Listed children")).toHaveText("0");
});

test("history and full-export failures stay visible without a download", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.assign(window, {
      api: {
        persistence: {
          listWorkspaces: async () => ({ ok: true, rows: [] }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          upsertWorkspace: async () => ({ ok: true }),
          loadTaskMessages: async () => ({ ok: false, page: null }),
        },
      },
    });
  });
  await page.goto("/?stavePreview=collaboration");
  await expect(page.getByRole("alert").first()).toContainText(
    "Saved collaboration history could not be loaded.",
  );
  const exportButton = page.getByRole("button", { name: "Export report" });
  await expect(exportButton).toBeEnabled();
  await exportButton.click();
  await expect(
    page.getByText("Saved-history export failed. No report was downloaded."),
  ).toBeVisible();
});
