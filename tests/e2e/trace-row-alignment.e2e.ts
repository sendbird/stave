import { expect, test } from "@playwright/test";

/**
 * One left edge for every row on the reasoning rail.
 *
 * A trace row is `agentSurface.row` plus an `InlineDisclosureIcon`, so a tool
 * title, a thought label and a notice title all start one glyph column in from
 * the rail's own edge. Interim prose carries no glyph — nothing produced it
 * but the model writing a sentence — and it used to render flush to that edge,
 * so a sentence sat a glyph column to the left of every row around it and read
 * as though it had escaped the run it belongs to.
 *
 * Measured in a real browser rather than asserted against a class name: the
 * inset is composed from three tokens, and the failure this guards against is
 * the resolved geometry disagreeing, not the source text changing.
 */
test("interim prose starts on the same text column as every other trace row", async ({
  page,
}) => {
  await page.goto("/?stavePreview=turn-events");

  /* `02 · Interim · Tool · 최종 답변` — the one sample that puts interim prose
     and a tool row on the same rail. */
  const sample = page.locator("#event-2");
  await expect(sample).toBeVisible();

  const prose = sample
    .getByText("관련 파일의 레이아웃을 확인하고 있습니다.", { exact: true })
    .first();
  const toolTitle = sample.getByText("Bash", { exact: true }).first();
  await expect(prose).toBeVisible();
  await expect(toolTitle).toBeVisible();

  const [proseBox, toolBox] = await Promise.all([
    prose.boundingBox(),
    toolTitle.boundingBox(),
  ]);
  expect(proseBox, "interim prose is laid out").not.toBeNull();
  expect(toolBox, "tool row title is laid out").not.toBeNull();

  /* Sub-pixel tolerance only: this is the same column, not a similar one. */
  expect(Math.abs(proseBox!.x - toolBox!.x)).toBeLessThanOrEqual(0.5);
});
