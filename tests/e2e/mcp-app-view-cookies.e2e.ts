import { expect, test } from "@playwright/test";
import { respondToMcpAppViewRequest } from "../../electron/main/mcp-app/mcp-app-view-protocol";
import { EMPTY_MCP_APP_CSP } from "../../src/lib/mcp-app/mcp-app-csp";
import { buildMcpAppViewUrl } from "../../src/lib/mcp-app/mcp-app-view";

// An unguarded cookie read used to stop the view after it reported its height.
for (const theme of ["light", "dark"] as const) {
  for (const width of [560, 1280]) {
    test(`an MCP App view keeps its content and follows its height (${theme}, ${width})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/?stavePreview=turn-events");
      const section = page.locator("section").filter({ has: page.getByRole("heading", { name: /MCP 앱 뷰/ }) });
      const frame = section.locator("iframe");
      await expect(frame).toBeVisible({ timeout: 15_000 });
      await section.scrollIntoViewIfNeeded();
      await expect(frame).toHaveAttribute("sandbox", "allow-scripts allow-forms");
      const view = section.frameLocator("iframe");
      await expect(view.locator("#cookies")).toHaveText("cookies: preview-visit=1");
      if (theme === "dark") await page.getByRole("button", { name: "Light", exact: true }).click();
      await expect(view.locator("#status")).toContainText(`theme: ${theme}`);
      // Clicking the page's theme control scrolls back to the header.
      await section.scrollIntoViewIfNeeded();
      await expect(view.locator("#input")).toContainText("Seoul");
      await expect(view.getByRole("heading", { name: "Seoul forecast" })).toBeVisible();
      const body = view.locator("body");
      await body.evaluate(() => document.fonts.ready);
      // The frame tracks content, including growth and shrinkage, within the
      // existing 80–2000px host limits. Rounding allows at most one CSS pixel.
      const expectContentHeight = async () => {
        await expect.poll(async () => {
          const outer = (await frame.boundingBox())!.height;
          const inner = await body.evaluate((el) => (el as HTMLElement).offsetHeight);
          return Math.abs(outer - Math.min(2000, Math.max(80, inner)));
        }).toBeLessThanOrEqual(1);
      };
      await expectContentHeight();
      const shortHeight = (await frame.boundingBox())!.height;
      await body.evaluate((el) => {
        const long = document.createElement("pre");
        long.id = "long-output";
        long.textContent = Array.from({ length: 100 }, (_, i) => `Line ${i}: English / 한국어`).join("\n");
        el.append(long);
      });
      await expectContentHeight();
      expect((await frame.boundingBox())!.height).toBeGreaterThan(shortHeight);
      await expect(view.locator("#long-output")).toContainText("Line 99");
      await view.locator("#long-output").evaluate((el) => el.remove());
      await expectContentHeight();
      await expect.poll(async () => (await frame.boundingBox())!.height).toBe(shortHeight);
      // The jar does not grant origin access to any other storage API.
      const storage = await view.locator("body").evaluate(() => {
        try {
          void window.localStorage;
          return "accessible";
        } catch (error) {
          return (error as DOMException).name;
        }
      });
      expect(storage).toBe("SecurityError");
      const imageSection = page
        .locator("section")
        .filter({ has: page.getByRole("heading", { name: /도구 결과 이미지/ }) });
      const image = imageSection.locator("img").first();
      await expect(image).toBeVisible();
      expect(await image.evaluate((el: HTMLImageElement) => [el.naturalWidth, el.naturalHeight])).toEqual([240, 120]);
      const htmlSection = page
        .locator("section")
        .filter({ has: page.getByRole("heading", { name: /인라인 HTML 렌더/ }) });
      await htmlSection.scrollIntoViewIfNeeded();
      await expect(htmlSection.locator("iframe")).toBeVisible();
      await expect(htmlSection.frameLocator("iframe").getByRole("heading", { name: "주간 토큰 사용량" })).toBeVisible();
    });
  }
}

test("the modeled post-paint failure is reachable without the document prelude", async ({ page }) => {
  let removed = false;
  await page.route("**/src/lib/mcp-app/mcp-app-csp.ts*", async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    const body = source.replace("${MCP_APP_VIEW_DOCUMENT_PRELUDE}", "");
    removed = body !== source;
    await route.fulfill({ response, body });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?stavePreview=turn-events");
  const section = page.locator("section").filter({ has: page.getByRole("heading", { name: /MCP 앱 뷰/ }) });
  const body = section.frameLocator("iframe").locator("body");
  await expect(body).toBeEmpty();
  await expect.poll(() => errors.some((error) => error.includes("cookie"))).toBe(true);
  expect(removed).toBe(true);
});

test("the desktop responder prelude runs under its header sandbox", async ({ page }) => {
  const response = await respondToMcpAppViewRequest({
    url: buildMcpAppViewUrl("fedcba9876543210-0f0e0d0c-0b0a-4908-8706-050403020100"),
    method: "GET",
    store: { read: async () => ({
      html: '<div id="output"></div><script>document.cookie="view=1";document.getElementById("output").textContent=document.cookie;</script>',
      record: { csp: EMPTY_MCP_APP_CSP },
    }) as never },
  });
  const headers = Object.fromEntries(response.headers);
  expect(headers["content-security-policy"]).toContain("sandbox allow-scripts allow-forms;");
  const body = await response.text();
  await page.route("**/header-cookie-fixture", (route) => route.fulfill({ status: 200, headers, body }));
  await page.goto("/header-cookie-fixture");
  await expect(page.locator("#output")).toHaveText("view=1");
  expect(await page.evaluate(() => {
    try { void localStorage; return "accessible"; }
    catch (error) { return (error as DOMException).name; }
  })).toBe("SecurityError");
});
