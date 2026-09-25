import { expect, test, type Page } from "@playwright/test";

interface PrHarnessOptions {
  holdDraft?: boolean;
  hookFailure?: "blocking" | "warning";
  failPushOnce?: boolean;
}

interface PrHarnessState {
  calls: string[];
  releaseDraft: () => void;
  hookFailure: PrHarnessOptions["hookFailure"];
}

async function installPrHarness(page: Page, options: PrHarnessOptions = {}) {
  await page.addInitScript((initial: PrHarnessOptions) => {
    const cwd = "/tmp/stave-project/.stave/workspaces/feature-pr";
    const commandOk = { ok: true, code: 0, stdout: "", stderr: "" };
    let draftReleased = !initial.holdDraft;
    let releaseDraftPromise: (() => void) | null = null;
    const draftGate = new Promise<void>((resolve) => {
      releaseDraftPromise = resolve;
    });
    let pushFailed = false;
    let statusItems = [
      { path: "src/a.ts", code: "M" },
      { path: "src/b.ts", code: "M" },
    ];

    const harness: PrHarnessState = {
      calls: [],
      hookFailure: initial.hookFailure,
      releaseDraft: () => {
        draftReleased = true;
        releaseDraftPromise?.();
      },
    };
    (window as unknown as { __prHarness: PrHarnessState }).__prHarness =
      harness;

    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: {
        streamTurn: async () => [],
        reviewDiff: async () => {
          harness.calls.push("review");
          return {
            ok: true,
            findings: [
              {
                kind: "bug",
                severity: "high",
                file: "src/a.ts",
                line: 1,
                message: "Review this branch condition.",
              },
            ],
          };
        },
      },
      sourceControl: {
        getPrStatus: async () => ({ ok: true, pr: null, stderr: "" }),
        getStatus: async ({ cwd: requestCwd }: { cwd?: string }) => {
          harness.calls.push(`status:${requestCwd}`);
          if (!draftReleased) await draftGate;
          return {
            ok: true,
            branch: "feature-pr",
            items: [...statusItems],
            hasConflicts: false,
            stderr: "",
          };
        },
        getHistory: async () => ({ ok: true, items: [], stderr: "" }),
        listBranches: async () => ({
          ok: true,
          current: "feature-pr",
          branches: ["main", "feature-pr"],
          remoteBranches: ["origin/main", "origin/feature-pr"],
          worktreePathByBranch: {},
          stderr: "",
        }),
        getRepoMergeSettings: async () => ({
          ok: true,
          squashMergeAllowed: true,
          mergeCommitAllowed: true,
          rebaseMergeAllowed: true,
          autoMergeAllowed: false,
          stderr: "",
        }),
        stageFiles: async ({
          paths,
          cwd: requestCwd,
        }: {
          paths: string[];
          cwd?: string;
        }) => {
          harness.calls.push(`stage:${requestCwd}:${paths.join(",")}`);
          return commandOk;
        },
        commit: async ({ cwd: requestCwd }: { cwd?: string }) => {
          harness.calls.push(`commit:${requestCwd}`);
          statusItems = [];
          return commandOk;
        },
        createPR: async ({ cwd: requestCwd }: { cwd?: string }) => {
          harness.calls.push(`create:${requestCwd}`);
          return {
            ok: true,
            prUrl: "https://github.example.invalid/example/stave/pull/1",
          };
        },
      },
      terminal: {
        runCommand: async ({
          command,
          cwd: requestCwd,
        }: {
          command: string;
          cwd?: string;
        }) => {
          harness.calls.push(`push:${requestCwd}:${command}`);
          if (initial.failPushOnce && !pushFailed) {
            pushFailed = true;
            return { ok: false, code: 1, stdout: "", stderr: "Push failed." };
          }
          return commandOk;
        },
      },
      scripts: {
        runHook: async ({ trigger }: { trigger: string }) => {
          harness.calls.push(`hook:${trigger}`);
          const failure =
            trigger === "pr.beforeOpen" && harness.hookFailure
              ? [
                  {
                    scriptId: "verify",
                    message: "Verification failed.",
                    blocking: harness.hookFailure === "blocking",
                  },
                ]
              : [];
          return {
            ok: failure.length === 0,
            summary: {
              trigger,
              totalEntries: failure.length,
              executedEntries: failure.length,
              failures: failure,
            },
          };
        },
      },
      shell: {
        openExternal: async () => ({ ok: true }),
      },
    };
  }, options);
}

function getCalls(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as { __prHarness: PrHarnessState }).__prHarness.calls,
  );
}

function trackBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().startsWith("Failed to load resource:")
    ) {
      errors.push(message.text());
    }
  });
  return errors;
}

test("create dialog keeps its header and actions visible while its body scrolls", async ({
  page,
}) => {
  const browserErrors = trackBrowserErrors(page);
  const surfaceColors: string[] = [];

  for (const { width, height, theme } of [
    { width: 1280, height: 720, theme: "dark" },
    { width: 980, height: 560, theme: "light" },
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(`/?stavePreview=create-pr&theme=${theme}`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("button", { name: "Create PR" }).click();
    const dialog = page.getByRole("dialog", { name: "Create Pull Request" });
    await expect(dialog.getByRole("textbox", { name: "Title" })).toBeVisible();

    const popup = await dialog.boundingBox();
    const heading = await dialog
      .getByRole("heading", { name: "Create Pull Request" })
      .boundingBox();
    const submit = dialog.getByRole("button", { name: "Create PR" });
    const submitBox = await submit.boundingBox();
    expect(popup).not.toBeNull();
    expect(heading).not.toBeNull();
    expect(submitBox).not.toBeNull();
    expect(popup!.y).toBeGreaterThanOrEqual(15);
    expect(popup!.y + popup!.height).toBeLessThanOrEqual(height - 15);
    expect(heading!.y).toBeGreaterThanOrEqual(popup!.y);
    expect(submitBox!.y + submitBox!.height).toBeLessThanOrEqual(
      popup!.y + popup!.height,
    );
    await submit.click({ trial: true });

    const formBody = dialog.locator("form > div").first();
    const bodyMetrics = await formBody.evaluate((element) => ({
      overflowY: getComputedStyle(element).overflowY,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    }));
    expect(bodyMetrics.overflowY).toBe("auto");
    expect(bodyMetrics.scrollHeight).toBeGreaterThan(bodyMetrics.clientHeight);
    await formBody.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(
      dialog.getByRole("textbox", { name: "Commit message" }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "Create Pull Request" }),
    ).toBeVisible();
    surfaceColors.push(
      await dialog.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    );
  }

  expect(surfaceColors[0]).not.toBe(surfaceColors[1]);
  expect(browserErrors).toEqual([]);
});

test("cancelling loading discards stale draft work and selected files persist through edits", async ({
  page,
}) => {
  const browserErrors = trackBrowserErrors(page);
  await installPrHarness(page, { holdDraft: true });
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto("/?stavePreview=create-pr", {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("button", { name: "Create PR" }).click();

  const dialog = page.getByRole("dialog", { name: "Create Pull Request" });
  await expect(dialog.getByText("Preparing a PR draft")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.evaluate(() =>
    (
      window as unknown as { __prHarness: PrHarnessState }
    ).__prHarness.releaseDraft(),
  );
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Create PR" }).click();

  const fileA = dialog.getByRole("checkbox", {
    name: "Include src/a.ts in the automatic commit",
  });
  const fileB = dialog.getByRole("checkbox", {
    name: "Include src/b.ts in the automatic commit",
  });
  await expect(fileA).toBeChecked();
  await fileB.uncheck();
  await dialog
    .getByRole("textbox", { name: "Title" })
    .fill("fix(pr): retain file scope");
  await expect(fileB).not.toBeChecked();
  await expect(fileA).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect((await getCalls(page)).some((call) => call.startsWith("stage:"))).toBe(
    false,
  );
  expect(browserErrors).toEqual([]);
});

test("review decisions and blocking verification stop before commit", async ({
  page,
}) => {
  const browserErrors = trackBrowserErrors(page);
  await installPrHarness(page, { hookFailure: "blocking" });
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto("/?stavePreview=create-pr&review=1", {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("button", { name: "Create PR" }).click();
  const dialog = page.getByRole("dialog", { name: "Create Pull Request" });
  await expect(dialog.getByRole("textbox", { name: "Title" })).toBeVisible();
  await dialog.getByRole("button", { name: "Create PR" }).click();
  await expect(dialog.getByText("Review this branch condition.")).toBeVisible();
  await dialog.getByRole("button", { name: "Stop and fix" }).click();
  await expect(dialog.getByText("PR creation paused")).toBeVisible();
  await dialog.getByRole("button", { name: "Create PR" }).click();
  await dialog.getByRole("button", { name: "Proceed anyway" }).click();
  await expect(
    dialog
      .getByRole("status")
      .getByText("Blocking pr.beforeOpen checks failed.", {
        exact: false,
      }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Proceed anyway" }),
  ).toHaveCount(0);
  expect(
    (await getCalls(page)).filter((call) =>
      /^(stage|commit|push|create):/.test(call),
    ),
  ).toEqual([]);
  await dialog.getByRole("button", { name: "Stop and fix" }).click();
  await expect(dialog.getByText("PR creation paused")).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("warning preflight, push failure, and retry retain commit order and workspace cwd", async ({
  page,
}) => {
  const browserErrors = trackBrowserErrors(page);
  await installPrHarness(page, {
    hookFailure: "warning",
    failPushOnce: true,
  });
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto("/?stavePreview=create-pr", {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("button", { name: "Create PR" }).click();
  const dialog = page.getByRole("dialog", { name: "Create Pull Request" });
  await expect(dialog.getByRole("textbox", { name: "Title" })).toBeVisible();
  await dialog.getByRole("button", { name: "Create PR" }).click();
  await expect(
    dialog.getByText("Verification reported warnings", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Proceed anyway" }).click();
  await expect(dialog.getByText("Push failed.")).toBeVisible();
  expect(
    (await getCalls(page)).some((call) => call.startsWith("create:")),
  ).toBe(false);
  await page.evaluate(() => {
    (
      window as unknown as { __prHarness: PrHarnessState }
    ).__prHarness.hookFailure = undefined;
  });
  await dialog.getByRole("button", { name: "Create PR" }).click();
  await expect(dialog).toBeHidden();

  const calls = await getCalls(page);
  const operations = calls.filter((call) =>
    /^(stage|commit|push|create):/.test(call),
  );
  expect(operations).toEqual([
    "stage:/tmp/stave-project/.stave/workspaces/feature-pr:src/a.ts,src/b.ts",
    "commit:/tmp/stave-project/.stave/workspaces/feature-pr",
    "push:/tmp/stave-project/.stave/workspaces/feature-pr:git push -u origin HEAD",
    "push:/tmp/stave-project/.stave/workspaces/feature-pr:git push -u origin HEAD",
    "create:/tmp/stave-project/.stave/workspaces/feature-pr",
  ]);
  expect(browserErrors).toEqual([]);
});
