import { expect, test, type Page } from "@playwright/test";

const fixtureUrl = "/tests/e2e/fixtures/standalone-cli.html";
const calls = (page: Page) => page.evaluate(() => (window as any).cliFixture.calls as string[]);
const dialog = (page: Page) => page.getByRole("dialog", { name: "End session and switch account?" });

async function open(page: Page, query = "") {
  await page.goto(fixtureUrl + query);
  await page.getByRole("button", { name: "Open Standalone CLI", exact: true }).click();
  await expect.poll(() => calls(page)).toContain("create:system-default:fresh");
}

async function selectWork(page: Page) {
  await page.getByRole("combobox", { name: /account for this tab/ }).click();
  await page.getByRole("option", { name: "Work", exact: true }).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toContainText("stop any running commands");
  await expect(dialog(page)).toContainText("A new conversation will start with Work");
}

for (const provider of ["claude-code", "codex"]) {
  test(`${provider}: changing display language preserves the live session attachment`, async ({ page }) => {
    await open(page, `?provider=${provider}`);
    await expect.poll(() => calls(page)).toContain("attach:session-1");
    const baseline = await page.evaluate(() => ({
      calls: [...(window as any).cliFixture.calls],
      detach: [...(window as any).cliFixture.detachCalls],
    }));
    await page.evaluate(() => (window as any).cliFixture.locale("ko"));
    await expect(page.locator("html")).toHaveAttribute("lang", "ko-KR");
    await expect(page.getByRole("button", { name: "CLI 세션 다시 시작" })).toBeVisible();
    expect(await calls(page)).toEqual(baseline.calls);
    expect(await page.evaluate(() => (window as any).cliFixture.detachCalls)).toEqual(baseline.detach);
    await page.evaluate(() => (window as any).cliFixture.locale("en"));
    await expect(page.getByRole("button", { name: "Restart CLI session" })).toBeVisible();
    expect(await calls(page)).toEqual(baseline.calls);
    expect(await page.evaluate(() => (window as any).cliFixture.detachCalls)).toEqual(baseline.detach);
  });
}

for (const provider of ["claude-code", "codex"]) {
  test(`${provider}: cancellation preserves the session and confirmation switches after pending launch shutdown`, async ({ page }) => {
    await open(page, `?pending&pending-close&provider=${provider}`);
    await selectWork(page);
    await dialog(page).getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog(page)).toBeHidden();
    expect(await calls(page)).toEqual(["create:system-default:fresh"]);
    expect(await page.evaluate((id) => (window as any).cliFixture.state().accountProfileIdByTab[id], provider)).toBe("system-default");

    // The confirmation is above the popover and can be clicked normally.
    if (await page.getByRole("button", { name: "Open Standalone CLI", exact: true }).isVisible()) {
      await page.getByRole("button", { name: "Open Standalone CLI", exact: true }).click();
    }
    await selectWork(page);
    await dialog(page).getByRole("button", { name: "End session and switch", exact: true }).click();
    await page.evaluate(() => (window as any).cliFixture.releaseCreate());
    await expect.poll(() => calls(page)).toContain("close:session-1");
    expect(await calls(page)).not.toContain("attach:session-1");
    expect(await calls(page)).not.toContain("create:work:fresh");
    expect(await page.evaluate((id) => (window as any).cliFixture.state().nativeSessionIdByTab[id], provider)).toBeUndefined();
    await page.evaluate(() => (window as any).cliFixture.releaseClose());
    await expect.poll(() => calls(page)).toContain("attach:session-2");
    const history = await calls(page);
    expect(history.indexOf("closed:session-1")).toBeLessThan(history.indexOf("create:work:fresh"));
    expect(history.filter((call) => call.startsWith("create:"))).toEqual(["create:system-default:fresh", "create:work:fresh"]);
  });
}

test("Restart during initial creation starts a fresh session after closing the old one", async ({ page }) => {
  await open(page, "?pending&pending-close");
  await page.getByRole("button", { name: "Restart CLI session" }).click();
  await page.evaluate(() => (window as any).cliFixture.releaseCreate());
  await expect.poll(() => calls(page)).toContain("close:session-1");
  expect((await calls(page)).filter((call) => call.startsWith("create:"))).toHaveLength(1);
  await page.evaluate(() => (window as any).cliFixture.releaseClose());
  await expect.poll(() => calls(page)).toContain("attach:session-2");
  expect((await calls(page)).filter((call) => call.startsWith("create:"))).toEqual(["create:system-default:fresh", "create:system-default:fresh"]);
  expect(await calls(page)).not.toContain("attach:session-1");
});

test("Restart after session exit creates a fresh conversation", async ({ page }) => {
  await open(page);
  await expect.poll(() => calls(page)).toContain("attach:session-1");
  await page.evaluate(() => (window as any).cliFixture.exit());
  await expect(page.getByRole("status").filter({ hasText: "Session exited" })).toBeVisible();
  await page.getByRole("button", { name: "Restart CLI session" }).click();
  await expect.poll(() => calls(page)).toContain("attach:session-2");
  expect((await calls(page)).filter((call) => call.startsWith("create:"))).toEqual(["create:system-default:fresh", "create:system-default:fresh"]);
});

test("failed close does not attach the old account or launch a new one", async ({ page }) => {
  await open(page, "?close-error");
  await expect.poll(() => calls(page)).toContain("attach:session-1");
  await selectWork(page);
  await dialog(page).getByRole("button", { name: "End session and switch", exact: true }).click();
  await expect.poll(() => calls(page)).toContain("close:session-1");
  if (await page.getByRole("button", { name: "Open Standalone CLI", exact: true }).isVisible()) {
    await page.getByRole("button", { name: "Open Standalone CLI", exact: true }).click();
  }
  await expect(page.getByRole("alert")).toContainText("Cannot stop session");
  expect((await calls(page)).filter((call) => call.startsWith("create:"))).toHaveLength(1);
});

test("warning stays above the terminal in every built-in theme and Escape cancels", async ({ page }) => {
  await open(page);
  await expect.poll(() => calls(page)).toContain("attach:session-1");
  await selectWork(page);
  const themes = await page.evaluate(() => (window as any).cliFixture.themes as string[]);
  for (const theme of themes) {
    await page.evaluate((id) => (window as any).cliFixture.theme(id), theme);
    const visible = await dialog(page).evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      const styles = getComputedStyle(element);
      return {
        aboveTerminal: top !== null && element.contains(top),
        background: styles.backgroundColor,
        color: styles.color,
      };
    });
    expect(visible.aboveTerminal, theme).toBe(true);
    expect(visible.background, theme).not.toBe("rgba(0, 0, 0, 0)");
    expect(visible.color, theme).not.toBe(visible.background);
  }
  await dialog(page).getByRole("button", { name: "Cancel", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  expect((await calls(page)).some((call) => call.startsWith("close:"))).toBe(false);
});

test("switching a running session closes it and routes input to the new account", async ({ page }) => {
  await open(page);
  await expect.poll(() => calls(page)).toContain("attach:session-1");
  await selectWork(page);
  await dialog(page).getByRole("button", { name: "End session and switch", exact: true }).click();
  await expect.poll(() => calls(page)).toContain("attach:session-2");
  if (await page.getByRole("button", { name: "Open Standalone CLI", exact: true }).isVisible()) {
    await page.getByRole("button", { name: "Open Standalone CLI", exact: true }).click();
  }
  await page.locator(".xterm-helper-textarea").fill("hello");
  await expect.poll(() => calls(page)).toContain("write:work");
  const history = await calls(page);
  expect(history.indexOf("closed:session-1")).toBeLessThan(history.indexOf("create:work:fresh"));
});
