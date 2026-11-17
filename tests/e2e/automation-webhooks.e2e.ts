import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test.use({ viewport: { width: 1280, height: 1000 } });

for (const variant of [{ lang: "en", theme: "light" }, { lang: "ko", theme: "dark" }]) {
  test(`webhook editor keeps secret transient and settings contained in ${variant.lang}/${variant.theme}`, async ({ page }) => {
    await page.goto(`/?stavePreview=schedules&new=1&lang=${variant.lang}&theme=${variant.theme}`);
    await page.getByRole("button", { name: variant.lang === "ko" ? "새 일정" : "New schedule", exact: true }).click();
    await page.evaluate(() => {
      const api = window.api?.automations;
      if (!api?.provisionWebhook) throw new Error("Missing preview provision bridge");
      const original = api.provisionWebhook;
      api.provisionWebhook = async (input) => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return original(input);
      };
    });
    await page.getByRole("button", { name: variant.lang === "ko" ? "웹훅" : "Webhook", exact: true }).click();
    await expect(page.getByRole("button", { name: variant.lang === "ko" ? "저장" : "Save", exact: true })).toBeDisabled();
    const section = page.locator("[data-webhook-trigger]");
    await expect(section.getByRole("switch", { name: variant.lang === "ko" ? "수신기 켜기" : "Enable receiver", exact: true })).toBeVisible();
    await expect(section.locator("[data-webhook-url]")).toHaveValue(/\/webhooks\/[a-f0-9]{64}$/);
    await expect(section.locator("[data-webhook-secret]")).toBeVisible();
    await expect(section.getByRole("button", { name: variant.lang === "ko" ? "테스트 이벤트 보내기" : "Send test event" })).toBeDisabled();
    const bind = section.getByLabel(variant.lang === "ko" ? "수신 주소" : "Bind address");
    await bind.fill("0.0.0.0");
    await expect(section.locator("[data-webhook-url]")).toHaveValue(/^http:\/\/127\.0\.0\.1:6330\//);
    await expect(section.getByRole("note")).toContainText(variant.lang === "ko" ? "다른 기기에 노출" : "outside this device");
    await bind.fill("127.0.0.1");
    await expect(section).toContainText(variant.lang === "ko" ? "앱이 실행 중일 때만" : "only while the app is running");
    await section.getByRole("button", { name: variant.lang === "ko" ? "필터 추가" : "Add filter" }).click();
    await expect(section.getByLabel(variant.lang === "ko" ? "JSON 경로" : "JSON path")).toHaveValue("$.action");
    await section.getByLabel(variant.lang === "ko" ? "중복 방지 시간(초)" : "Dedupe window (seconds)").fill("600");
    await section.getByLabel(variant.lang === "ko" ? "이벤트 모으는 시간(초)" : "Coalescing window (seconds)").fill("10");
    await section.getByRole("button", { name: variant.lang === "ko" ? "비밀키 숨기기" : "Dismiss secret" }).click();
    await expect(section.locator("[data-webhook-secret]")).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    const bounds = await section.boundingBox();
    expect(bounds?.width).toBeLessThanOrEqual(1280);
    await section.evaluate((element) => element.scrollIntoView({ block: "start" }));
    await mkdir("/tmp/gap-h7", { recursive: true });
    await page.screenshot({ path: `/tmp/gap-h7/webhook-${variant.lang}-${variant.theme}.png` });
    await page.setViewportSize({ width: 800, height: 1000 });
    await expect.poll(() => section.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/gap-h7/webhook-${variant.lang}-${variant.theme}-narrow.png` });
    await page.getByLabel(variant.lang === "ko" ? "이름" : "Name", { exact: true }).fill("Review incoming event");
    await page.getByLabel(variant.lang === "ko" ? "지침" : "Instructions").fill("Review {{body.action}}.");
    await page.evaluate(() => {
      const api = window.api?.automations;
      if (!api?.create) throw new Error("Missing preview create bridge");
      const original = api.create;
      api.create = async (input) => {
        (window as unknown as { savedWebhookDraft: unknown }).savedWebhookDraft = input;
        return original(input);
      };
    });
    await page.getByRole("button", { name: variant.lang === "ko" ? "저장" : "Save", exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { savedWebhookDraft?: unknown }).savedWebhookDraft)).toBeTruthy();
    const saved = await page.evaluate(() => (window as unknown as { savedWebhookDraft: Record<string, unknown> }).savedWebhookDraft);
    expect(saved.webhook).toMatchObject({ dedupeWindowSeconds: 600, coalesceWindowSeconds: 10, filters: [{ path: "$.action", operator: "equals", value: "opened" }] });
    expect(JSON.stringify(saved)).not.toContain("preview-signing-secret");
    expect(saved).not.toHaveProperty("secret");
  });
}
