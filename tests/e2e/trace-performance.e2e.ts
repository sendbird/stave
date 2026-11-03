import { expect, test } from "@playwright/test";
import type { TraceFixture, TimelineFixture } from "./fixtures/trace-performance";

declare global {
  interface Window { traceFixture: TraceFixture; timelineFixture: TimelineFixture }
}

test("streaming reuses settled rows and closed payloads mount on demand without losing state", async ({ page }) => {
  await page.goto("/?stavePreview=agent-messages");
  await expect(page.locator("[data-trace-streaming-label]")).toBeVisible();
  await page.evaluate(async () => {
    const path = "/tests/e2e/fixtures/trace-performance.tsx";
    const { mountTraceFixture } = await import(path);
    window.traceFixture = mountTraceFixture();
  });
  const row = page.locator('[data-tool-use-id="tool-0"]');
  await expect(row).toBeVisible();
  await expect(page.getByText("output-0", { exact: true })).toHaveCount(0);
  const unchangedReads = await page.evaluate(() => {
    window.traceFixture.resetReads();
    window.traceFixture.appendText();
    return [...window.traceFixture.reads];
  });
  expect(unchangedReads.every((count) => count === 0)).toBe(true);
  await row.getByRole("button").click();
  await expect(page.getByText("output-0", { exact: true })).toBeVisible();
  await row.getByRole("button").first().click();
  await expect(page.getByText("output-0", { exact: true })).toBeHidden();
  await row.getByRole("button").click();
  await expect(page.getByText("output-0", { exact: true })).toBeVisible();
  const changedReads = await page.evaluate(() => {
    window.traceFixture.resetReads();
    window.traceFixture.updateTool(0);
    return [...window.traceFixture.reads];
  });
  expect(changedReads[0]).toBeGreaterThan(0);
  expect(changedReads.slice(1).every((count) => count === 0)).toBe(true);
  await expect(row.getByText("updated.ts", { exact: true })).toBeVisible();
  const draft = page.getByRole("textbox", { name: "Reasoning draft" });
  await expect(draft).toHaveCount(0);
  const thinking = page.getByRole("button", { name: /Finished thinking/ }).last();
  await thinking.click();
  await draft.fill("kept after closing");
  await thinking.click();
  await expect(draft).toBeHidden();
  await thinking.click();
  await expect(draft).toHaveValue("kept after closing");
});

test("the live timeline clock advances without parsing unchanged tool inputs", async ({ page }) => {
  await page.goto("/?stavePreview=agent-messages");
  await expect(page.locator("[data-trace-streaming-label]")).toBeVisible();
  const reads = await page.evaluate(async () => {
    const path = "/tests/e2e/fixtures/trace-performance.tsx";
    const { mountTimelineFixture } = await import(path);
    window.timelineFixture = mountTimelineFixture();
    return window.timelineFixture.reads();
  });
  expect(reads).toBeGreaterThan(0);
  const row = page.locator('[data-trace-span-id="tool:clock-tool"]');
  const original = await row.innerText();
  await expect.poll(() => row.innerText()).not.toBe(original);
  expect(await page.evaluate(() => window.timelineFixture.reads())).toBe(reads);
});

test("opened payloads retain reasoning accessibility, argument controls and failure recovery", async ({ page }) => {
  await page.goto("/?stavePreview=agent-messages");
  await expect(page.locator("[data-trace-streaming-label]")).toBeVisible();
  await page.evaluate(async () => {
    const path = "/tests/e2e/fixtures/trace-performance.tsx";
    const { mountDisclosureFixture } = await import(path);
    (window as unknown as { disclosure: ReturnType<typeof mountDisclosureFixture> }).disclosure = mountDisclosureFixture();
  });
  await expect(page.getByText("Open https://example.com/docs.", { exact: true })).toHaveCount(0);
  await page.locator('[data-disclosure-fixture] [data-thinking-status="thinking"] button').click();
  const thought = page.getByText("Open https://example.com/docs.", { exact: true });
  await expect(thought).toBeVisible();
  await expect(thought.locator("a")).toHaveCount(0);
  await expect(page.locator('[aria-busy="true"]')).toBeVisible();
  const tool = page.locator('[data-disclosure-fixture] [data-tool-run-status="running"]');
  await tool.getByRole("button").click();
  await expect(tool.locator('[data-trace-output-capped="true"]')).toHaveCount(2);
  await expect(tool.getByRole("button", { name: "Copy", exact: true })).toHaveCount(2);
  await expect(tool.getByText("Live output", { exact: true })).toBeVisible();
  const failed = page.locator('[data-disclosure-fixture] [data-tool-run-status="failed"]');
  await failed.getByRole("button").click();
  await expect(failed.getByRole("alert")).toContainText("exit 1");
  await failed.getByRole("button", { name: "Retry", exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { disclosure: { retries(): number } }).disclosure.retries())).toBe(1);
});
