import { expect, test, type Page } from "@playwright/test";

const prUrl = "https://github.com/example/repo/pull/42";
const headOid = "88a73338498bed7d96bb21c7c7f6a3c3358d5f16";

interface ManageHarness {
  requests: Array<Record<string, unknown>>;
  cleanupTargets: unknown[];
  state: "OPEN" | "CLOSED" | "MERGED";
  isDraft: boolean;
  autoMerge: boolean;
  title: string;
  body: string;
  reviewers: string[];
  /** Applied to the pull request right before the next `details` read, as if someone edited it on GitHub. */
  remoteEdit: { title?: string; body?: string } | null;
  /** The next write of this action fails with this message. */
  fail: { action: string; detail: string } | null;
}

interface HarnessOptions {
  state?: ManageHarness["state"];
  isDraft?: boolean;
  autoMerge?: boolean;
  reviewers?: string[];
}

async function installHarness(page: Page, options: HarnessOptions = {}) {
  await page.addInitScript(({ url, oid, initial }) => {
    const harness: ManageHarness = {
      requests: [],
      cleanupTargets: [],
      state: initial.state ?? "OPEN",
      isDraft: initial.isDraft ?? false,
      autoMerge: initial.autoMerge ?? false,
      title: "Track the remote branch",
      body: "Keeps the upstream name.",
      reviewers: initial.reviewers ?? ["hubot"],
      remoteEdit: null,
      fail: null,
    };
    const w = window as unknown as Record<string, unknown>;
    w.__prHarness = harness;
    window.addEventListener("stave:open-workspace-cleanup", (event) => {
      harness.cleanupTargets.push((event as CustomEvent).detail);
    });
    const details = () => ({
      number: 42,
      title: harness.title,
      body: harness.body,
      state: harness.state,
      isDraft: harness.isDraft,
      authorLogin: "octocat",
      autoMerge: harness.autoMerge ? { mergeMethod: "MERGE", enabledBy: "octocat" } : null,
      reviewRequests: harness.reviewers.map((handle) => ({ handle, kind: handle.includes("/") ? "team" : "user" })),
      latestReviews: [{ login: "monalisa", state: "CHANGES_REQUESTED" }],
      headRefOid: oid,
      baseRefName: "main",
    });
    w.api = {
      provider: {}, terminal: {}, scripts: {}, shell: {},
      sourceControl: {
        getPrStack: async () => ({ ok: true, stack: null, code: null }),
        getRepoMergeSettings: async () => ({
          ok: true, squashMergeAllowed: false, mergeCommitAllowed: true, rebaseMergeAllowed: true, autoMergeAllowed: true, stderr: "",
        }),
        getPrStatus: async () => ({
          ok: true,
          stderr: "",
          pr: {
            number: 42, title: harness.title, state: harness.state, isDraft: harness.isDraft, url,
            reviewDecision: null, mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", checksRollup: "SUCCESS",
            mergedAt: harness.state === "MERGED" ? "2026-11-20T05:00:00Z" : null,
            baseRefName: "main", headRefName: "feature-pr", headRefOid: oid,
          },
        }),
        prManage: async (args: Record<string, unknown>) => {
          harness.requests.push(args);
          const action = String(args.action);
          if (harness.fail?.action === action) {
            const detail = harness.fail.detail;
            harness.fail = null;
            return { ok: false, reason: "failed", detail };
          }
          switch (action) {
            case "details":
              if (harness.remoteEdit) {
                Object.assign(harness, harness.remoteEdit);
                harness.remoteEdit = null;
              }
              return { ok: true, kind: "details", details: details() };
            case "reviewer-candidates": {
              const query = String(args.query ?? "").toLowerCase();
              const people = [
                { login: "monalisa", name: "Mona Lisa", suggested: true },
                { login: "alex-rivera", name: "Alex Rivera", suggested: false },
                { login: "hubot", name: "Hubot", suggested: false },
              ];
              return {
                ok: true,
                kind: "reviewer-candidates",
                candidates: people.filter((person) => `${person.login} ${person.name}`.toLowerCase().includes(query)),
              };
            }
            case "edit":
              if (typeof args.title === "string") harness.title = args.title;
              if (typeof args.body === "string") harness.body = args.body;
              break;
            case "reviewers":
              harness.reviewers = [
                ...harness.reviewers.filter((handle) => !(args.remove as string[]).includes(handle)),
                ...(args.add as string[]),
              ];
              break;
            case "draft": harness.isDraft = true; break;
            case "auto-merge": harness.autoMerge = args.enabled === true; break;
            case "close": harness.state = "CLOSED"; break;
            case "reopen": harness.state = "OPEN"; break;
          }
          return { ok: true, kind: "written" };
        },
      },
    };
  }, { url: prUrl, oid: headOid, initial: options });
}

const harness = (page: Page) => page.evaluate(() => (window as unknown as { __prHarness: ManageHarness }).__prHarness);
const writes = async (page: Page) =>
  (await harness(page)).requests.filter((request) => request.action !== "details" && request.action !== "reviewer-candidates");

async function openPreview(page: Page, query = "lang=en&theme=light") {
  await page.goto(`/?stavePreview=create-pr&${query}`);
  await page.evaluate(() => document.fonts.ready);
  return page.getByTestId("create-pr-preview").getByRole("button").first();
}

async function openMenu(page: Page, name = "Open PR status menu") {
  await page.getByTestId("create-pr-preview").getByRole("button", { name }).click();
  return page.getByRole("menu");
}

test("an open pull request offers edit, draft, auto-merge and close, and each write names the PR", async ({ page }) => {
  await installHarness(page, { autoMerge: true });
  const status = await openPreview(page);
  await expect(status).toContainText("Ready to merge");

  let menu = await openMenu(page);
  await expect(menu.getByRole("menuitem", { name: "Edit details…" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Close pull request…" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Reopen pull request" })).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "Archive workspace…" })).toHaveCount(0);
  // The label comes from the pull request itself: auto-merge is queued, so the menu offers turning it off.
  await menu.getByRole("menuitem", { name: "Turn off auto-merge" }).click();
  await expect.poll(() => writes(page)).toEqual([expect.objectContaining({ action: "auto-merge", enabled: false, prUrl })]);

  menu = await openMenu(page);
  await menu.getByRole("menuitem", { name: "Turn on auto-merge" }).click();
  // Squash is not allowed in this repository, so the first allowed method is used, pinned to the head the menu read.
  await expect.poll(async () => (await writes(page))[1]).toEqual(
    expect.objectContaining({ action: "auto-merge", enabled: true, method: "merge", expectedHeadOid: headOid, prUrl }),
  );

  menu = await openMenu(page);
  await menu.getByRole("menuitem", { name: "Convert to draft" }).click();
  await expect.poll(async () => (await writes(page))[2]).toEqual(expect.objectContaining({ action: "draft", prUrl }));
  await expect(status).toContainText("Draft");

  menu = await openMenu(page);
  await expect(menu.getByRole("menuitem", { name: "Edit details…" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Convert to draft" })).toHaveCount(0);
  for (const request of (await harness(page)).requests) {
    expect(request.prUrl).toBe(prUrl);
    expect(JSON.stringify(request)).not.toContain("delete");
  }
});

test("closing asks first, keeps the branch, and a closed pull request can be reopened", async ({ page }) => {
  await installHarness(page);
  const status = await openPreview(page);
  await expect(status).toContainText("Ready to merge");

  let menu = await openMenu(page);
  await menu.getByRole("menuitem", { name: "Close pull request…" }).click();
  const dialog = page.getByRole("dialog", { name: "Close pull request #42?" });
  await expect(dialog).toContainText("The branch is kept");
  await expect(dialog).toContainText("Stave stops watching this pull request");
  expect(await writes(page)).toEqual([]);

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  expect(await writes(page)).toEqual([]);

  menu = await openMenu(page);
  await menu.getByRole("menuitem", { name: "Close pull request…" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Close pull request" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(status).toContainText("Closed");
  expect(await writes(page)).toEqual([expect.objectContaining({ action: "close", prUrl })]);

  menu = await openMenu(page);
  await expect(menu.getByRole("menuitem", { name: "Edit details…" })).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "Close pull request…" })).toHaveCount(0);
  await menu.getByRole("menuitem", { name: "Reopen pull request" }).click();
  await expect(status).toContainText("Ready to merge");
  expect((await writes(page))[1]).toEqual(expect.objectContaining({ action: "reopen", prUrl }));
});

test("a merged pull request offers archiving its workspace in the cleanup center", async ({ page }) => {
  await installHarness(page, { state: "MERGED" });
  const status = await openPreview(page);
  await expect(status).toContainText("Merged");

  const menu = await openMenu(page);
  await expect(menu.getByRole("menuitem", { name: "Edit details…" })).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "Close pull request…" })).toHaveCount(0);
  await menu.getByRole("menuitem", { name: "Archive workspace…" }).click();
  expect((await harness(page)).cleanupTargets).toEqual([{ workspaceId: "preview-pr" }]);
  // Nothing was read from or written to GitHub for a merged pull request.
  expect((await harness(page)).requests).toEqual([]);
});

test("editing sends only the changed fields and the reviewer changes", async ({ page }) => {
  await installHarness(page);
  await openPreview(page);
  const menu = await openMenu(page);
  await menu.getByRole("menuitem", { name: "Edit details…" }).click();

  const dialog = page.getByRole("dialog", { name: "Edit pull request #42" });
  const title = dialog.getByRole("textbox", { name: "Title" });
  await expect(title).toHaveValue("Track the remote branch");
  await expect(dialog.getByRole("textbox", { name: "Description" })).toHaveValue("Keeps the upstream name.");
  await expect(dialog).toContainText("@hubot");
  await expect(dialog).toContainText("monalisa (requested changes)");

  // A suggestion, a search result and a typed login; then drop the existing request.
  await dialog.getByRole("button", { name: /@monalisa/ }).click();
  const search = dialog.getByRole("searchbox", { name: "Find a reviewer" });
  await search.fill("rive");
  await dialog.getByRole("button", { name: /@alex-rivera/ }).click();
  await search.fill("@acme/core");
  await search.press("Enter");
  await expect(dialog.getByRole("textbox", { name: "Title" })).toBeVisible();
  await dialog.getByRole("button", { name: "Remove hubot" }).click();

  await title.fill("Track the upstream branch");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await writes(page)).toEqual([
    { action: "edit", prUrl, cwd: "/tmp/stave-project/.stave/workspaces/feature-pr", title: "Track the upstream branch" },
    {
      action: "reviewers", prUrl, cwd: "/tmp/stave-project/.stave/workspaces/feature-pr",
      add: ["monalisa", "alex-rivera", "acme/core"], remove: ["hubot"],
    },
  ]);
  // The status was read again after the save, so the menu shows the new title.
  await expect(await openMenu(page)).toContainText("#42 Track the upstream branch");
});

test("a failed save keeps the input and shows the reason", async ({ page }) => {
  await installHarness(page);
  await openPreview(page);
  await (await openMenu(page)).getByRole("menuitem", { name: "Edit details…" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit pull request #42" });
  const body = dialog.getByRole("textbox", { name: "Description" });
  await body.fill("A better description.");
  await page.evaluate(() => {
    (window as unknown as { __prHarness: ManageHarness }).__prHarness.fail = { action: "edit", detail: "GraphQL: Resource not accessible" };
  });
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("GraphQL: Resource not accessible");
  await expect(body).toHaveValue("A better description.");

  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect((await harness(page)).body).toBe("A better description.");
});

test("a pull request edited on GitHub meanwhile is not overwritten without a warning", async ({ page }) => {
  await installHarness(page);
  await openPreview(page);
  await (await openMenu(page)).getByRole("menuitem", { name: "Edit details…" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit pull request #42" });
  const title = dialog.getByRole("textbox", { name: "Title" });
  await title.fill("My title");
  await page.evaluate(() => {
    (window as unknown as { __prHarness: ManageHarness }).__prHarness.remoteEdit = { title: "Their title", body: "Their description." };
  });

  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toContainText("Someone edited this pull request on GitHub");
  await expect(dialog).toContainText("Title on GitHub now: Their title");
  await expect(title).toHaveValue("My title");
  // The description was not touched here, so it follows GitHub and will not be sent.
  await expect(dialog.getByRole("textbox", { name: "Description" })).toHaveValue("Their description.");
  expect(await writes(page)).toEqual([]);

  await dialog.getByRole("button", { name: "Save and overwrite" }).click();
  await expect(dialog).toHaveCount(0);
  expect(await writes(page)).toEqual([expect.objectContaining({ action: "edit", title: "My title" })]);
  expect((await writes(page))[0]).not.toHaveProperty("body");
});

/** Opens a pull request in the review panel and answers its manage requests from memory. */
async function openReviewDetail(page: Page, query = "", reviewers: string[] = []) {
  await page.goto(`/?stavePreview=github-pr-activity${query}`);
  await page.getByRole("button", { name: /Keep the return path after sign-in/ }).click();
  await page.evaluate(() => document.fonts.ready);
  return page.evaluateHandle((handles) => {
    const seen: Array<Record<string, unknown>> = [];
    const api = (window as unknown as { api: { sourceControl: Record<string, unknown> } }).api;
    let state = "OPEN";
    api.sourceControl.prManage = async (args: Record<string, unknown>) => {
      seen.push(args);
      if (args.action === "close") state = "CLOSED";
      if (args.action === "reviewer-candidates") {
        return { ok: true, kind: "reviewer-candidates", candidates: [{ login: "monalisa", name: "Mona Lisa", suggested: true }] };
      }
      if (args.action !== "details") return { ok: true, kind: "written" };
      return {
        ok: true,
        kind: "details",
        details: {
          number: 42, title: "Keep the return path after sign-in", body: "", state, isDraft: false, authorLogin: "alex",
          autoMerge: null, reviewRequests: handles.map((handle) => ({ handle, kind: handle.includes("/") ? "team" : "user" })),
          latestReviews: [{ login: "sam", state: "CHANGES_REQUESTED" }],
          headRefOid: "89abcdef0123456789abcdef0123456789abcdef", baseRefName: "main",
        },
      };
    };
    return seen;
  }, reviewers);
}

for (const { lang, theme, density, more, edit, titleLabel } of [
  { lang: "en", theme: "light", density: "regular", more: "More actions", edit: "Edit details…", titleLabel: "Title" },
  { lang: "ko", theme: "dark", density: "compact", more: "추가 작업", edit: "세부 정보 편집…", titleLabel: "제목" },
]) {
  for (const width of [360, 1100]) {
    test(`the edit dialog keeps long reviewers inside it at ${width}px (${lang}, ${theme}, ${density})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await openReviewDetail(page, `&lang=${lang}&theme=${theme}&density=${density}${width > 900 ? "&wide" : ""}`, [
        "hubot",
        "an-organization-with-a-long-name/a-team-with-an-even-longer-slug-for-reviews",
      ]);
      await page.getByRole("button", { name: more }).click();
      await page.getByRole("menu").getByRole("menuitem", { name: edit }).click();
      const dialog = page.locator("[data-pr-edit-dialog]");
      await expect(dialog.getByRole("textbox", { name: titleLabel })).toBeVisible();
      await expect(dialog.locator("[data-pr-reviewer-candidate]")).toHaveCount(1);
      // Measure the settled dialog, not a frame of its opening transition.
      await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined))));

      const box = (await dialog.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5);
      const chips = await dialog.locator("[data-pr-reviewer]").all();
      expect(chips).toHaveLength(2);
      for (const chip of chips) {
        const chipBox = (await chip.boundingBox())!;
        expect(chipBox.x).toBeGreaterThanOrEqual(box.x - 0.5);
        expect(chipBox.x + chipBox.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
      }
      // Nothing inside the dialog forces a horizontal scroll.
      expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `test-results/pr-edit-dialog-${lang}-${theme}-${width}.png` });
    });
  }
}

test("the review detail header manages a pull request named by URL", async ({ page }) => {
  const requests = await openReviewDetail(page);

  await page.getByRole("button", { name: "More actions" }).click();
  let menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "Edit details…" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Turn on auto-merge" })).toBeVisible();
  // This pull request has no workspace here, so there is nothing to archive.
  await expect(menu.getByRole("menuitem", { name: "Archive workspace…" })).toHaveCount(0);
  await menu.getByRole("menuitem", { name: "Close pull request…" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Close pull request" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "More actions" }).click();
  menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "Reopen pull request" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Close pull request…" })).toHaveCount(0);
  const seen = await requests.jsonValue();
  expect(seen.filter((request) => request.action === "close")).toEqual([
    { action: "close", prUrl: "https://github.com/example/widgets/pull/42", cwd: "/tmp/widgets" },
  ]);
});
