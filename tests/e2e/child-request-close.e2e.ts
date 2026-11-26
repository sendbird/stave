import { expect, test, type Page } from "@playwright/test";

/**
 * The delegated-request slot above the composer, on the real `ChildRequestSlot`
 * (composer-frame preview, `childRequest=answered`). A child request that was
 * already answered says so and can be closed; closing it brings up the request
 * queued behind it, which is still pending and so has no close. The preview
 * seeds its notifications through the notification store and hydrates from it,
 * so a reload shows what was saved: the closed request does not come back.
 */

// The first page of a run waits on the dev server's cold compile.
test.describe.configure({ timeout: 60_000 });

async function open(page: Page, args: { locale: "en" | "ko"; queued: boolean }) {
  const params = new URLSearchParams({
    stavePreview: "composer-frame",
    case: "idle",
    childRequest: "answered",
    lang: args.locale,
  });
  if (!args.queued) params.set("queued", "0");
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(`/?${params}`, { waitUntil: "domcontentloaded" });
}

test("closing an answered child request shows the pending one behind it", async ({ page }) => {
  await open(page, { locale: "en", queued: true });
  const slot = page.getByRole("region", { name: "Requests from delegated tasks" });
  await expect(slot.getByText("This request was answered or expired.")).toBeVisible();
  await expect(slot.getByText("+1 more")).toBeVisible();
  const close = slot.getByRole("button", { name: "Close" });
  await expect(close).toBeVisible();

  await close.click();

  // The queued request takes the slot: still pending, so answerable and not closable.
  await expect(slot.getByText("bun run check:design-system")).toBeVisible();
  await expect(slot.getByRole("button", { name: /Allow once/ })).toBeVisible();
  await expect(slot.getByText("This request was answered or expired.")).toHaveCount(0);
  await expect(slot.getByRole("button", { name: "Close" })).toHaveCount(0);
  await expect(slot.getByText("+1 more")).toHaveCount(0);

  // The close was saved: after a reload only the pending request is left.
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(slot.getByText("bun run check:design-system")).toBeVisible();
  await expect(slot.getByText("This request was answered or expired.")).toHaveCount(0);
  await expect(slot.getByText("+1 more")).toHaveCount(0);
});

test("closing the only child request removes the slot (ko)", async ({ page }) => {
  await open(page, { locale: "ko", queued: false });
  const slot = page.getByRole("region", { name: "위임 작업의 요청" });
  const settled = slot.getByText("이 요청에 응답했거나 요청이 만료되었습니다.");
  await expect(settled).toBeVisible();
  // Reloading alone brings the saved, still-open request back: only Close removes it.
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(settled).toBeVisible();

  await slot.getByRole("button", { name: "닫기" }).click();

  await expect(slot).toHaveCount(0);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("textbox", { name: "프롬프트" })).toBeVisible();
  await expect(slot).toHaveCount(0);
});

test("switching preview cases in one browser does not carry the other case's requests", async ({ page }) => {
  await open(page, { locale: "en", queued: true });
  const slot = page.getByRole("region", { name: "Requests from delegated tasks" });
  await expect(slot.getByText("+1 more")).toBeVisible();

  await open(page, { locale: "en", queued: false });
  await expect(slot.getByText("This request was answered or expired.")).toBeVisible();
  await expect(slot.getByText("+1 more")).toHaveCount(0);
  await slot.getByRole("button", { name: "Close" }).click();
  await expect(slot).toHaveCount(0);
});

// A Codex child's asynchronous question whose delegation was cancelled after
// its turn ended (`childRequest=async-ended`). Only the delegation can send to
// the managed child, and it takes no follow-up, so an answer cannot be
// delivered. Before the fix both buttons failed with "this task is managed"
// and the card had no way out.
test("an answer nothing can deliver says so and offers a close that persists", async ({ page }) => {
  await page.goto("/?stavePreview=composer-frame&childRequest=async-ended");
  const slot = page.getByRole("region", { name: "Requests from delegated tasks" });
  await slot.getByText("Scroll container", { exact: true }).click();
  await slot.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(slot.getByRole("alert")).toContainText("This question can no longer be answered");
  await expect(slot.getByRole("alert")).not.toContainText("managed");
  // The question is still shown as asked, and now it can be closed.
  await expect(slot.getByRole("button", { name: "Continue", exact: true })).toBeVisible();
  await slot.getByRole("button", { name: "Close" }).click();
  await expect(slot).toHaveCount(0);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("textbox", { name: "Prompt" })).toBeVisible();
  await expect(slot).toHaveCount(0);
});

test("declining a question nothing can deliver closes it for good (ko)", async ({ page }) => {
  await page.goto("/?stavePreview=composer-frame&childRequest=async-ended&lang=ko");
  const slot = page.getByRole("region", { name: "위임 작업의 요청" });
  await expect(slot.getByText("Scroll container", { exact: true })).toBeVisible();
  await slot.getByRole("button", { name: "응답 거절" }).click();
  await expect(slot).toHaveCount(0);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("textbox", { name: "프롬프트" })).toBeVisible();
  await expect(slot).toHaveCount(0);
});

for (const action of ["Continue", "Decline to answer"]) {
  test(`${action} waits for delivery, explains a failed attempt, and closes on retry`, async ({ page }) => {
    await page.goto("/?stavePreview=composer-frame&childRequest=live&holdAnswer=1");
    const slot = page.getByRole("region", { name: "Requests from delegated tasks" });
    if (action === "Continue") await slot.getByText("Scroll container", { exact: true }).click();
    const button = slot.getByRole("button", { name: action, exact: true });
    await button.click();
    await expect(slot.getByRole("alert")).toContainText("fixture: transport interrupted");
    await button.click();
    await expect(button).toBeDisabled();
    await page.evaluate(() => window.dispatchEvent(new Event("fixture-deliver-answer")));
    await expect(slot).toHaveCount(0);
  });
}
