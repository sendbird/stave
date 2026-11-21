import { expect, test } from "@playwright/test";

test("the PR status menu opens a Tars CI draft without submitting or changing the PR", async ({ page }) => {
  const url = "https://github.com/team/project/pull/42";
  await page.addInitScript((prUrl) => {
    const w = window as unknown as Record<string, unknown>;
    w.__prHarness = true;
    w.api = {
      provider: {}, terminal: {}, scripts: {}, shell: {},
      sourceControl: {
        getPrStatus: async () => ({ ok: true, stderr: "", pr: {
          number: 42, title: "Verify the change", state: "OPEN", isDraft: false, url: prUrl, reviewDecision: null,
          mergeable: "MERGEABLE", mergeStateStatus: "BLOCKED", checksRollup: "FAILURE", mergedAt: null,
          baseRefName: "main", headRefName: "feature-pr",
        } }),
        getStatus: async () => ({ ok: true, branch: "feature-pr", items: [], hasConflicts: false, stderr: "" }),
      },
      tars: {
        getDraft: async () => null,
        saveDraft: async ({ draft }: { draft: { text: string } }) => sessionStorage.setItem("ci-draft", draft.text),
      },
    };
  }, url);
  await page.goto("/?stavePreview=create-pr&lang=en", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Open PR status menu" }).click();
  await page.getByRole("menuitem", { name: "Summarize CI failures in Tars" }).click();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("ci-draft"))).toBe(`Summarize the CI failures for ${url}`);
});

test("after reload, the earlier CI result drafts a fix for its own PR", async ({ page }) => {
  const first = "https://github.com/team/project/pull/12";
  const second = "https://github.com/team/project/pull/99";
  await page.goto("/?stavePreview=tars&lang=en", { waitUntil: "domcontentloaded" });
  const editor = page.locator("[data-tars-composer]").getByRole("textbox");
  for (const url of [first, second]) {
    await editor.fill(url);
    await editor.press("Enter");
    await expect(editor).toHaveText("");
  }
  await page.evaluate(() => {
    const key = "stave-preview-conversation";
    const saved = JSON.parse(sessionStorage.getItem(key)!);
    for (const message of saved.messages) {
      message.reply = "A failed job printed unrelated URL https://github.com/untrusted/other/pull/1";
      message.decision = { reply: message.reply, actions: [], ciFailureHead: "a".repeat(40) };
    }
    sessionStorage.setItem(key, JSON.stringify(saved));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  const cards = page.getByTestId("tars-ci-fix-draft");
  await expect(cards).toHaveCount(2);
  await page.evaluate(() => document.fonts.ready);
  expect(await cards.first().evaluate(button => button.clientWidth < button.parentElement!.clientWidth)).toBe(true);
  await editor.fill("Keep the current implementation.");
  await cards.first().click();
  await expect(editor).toContainText("Keep the current implementation.");
  await expect(editor).toContainText(first);
  await expect(editor).not.toContainText(second);
  await expect(editor).not.toContainText("untrusted");
  await expect(page.locator("[data-tars-message]")).toHaveCount(2);
});
