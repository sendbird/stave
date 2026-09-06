import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave } from "./harness/stave-app";

test("composer keeps its draft through model inspection and records input response", async ({}, testInfo) => {
  const projectPath = await mkdtemp(path.join(tmpdir(), "stave-composer-"));
  const stave = await launchStave();
  const errors: string[] = [];
  stave.page.on("pageerror", (error) => errors.push(error.message));
  try {
    await stave.page
      .getByTestId("workspace-welcome")
      .getByRole("button", { name: "Open a project" })
      .click();
    await stave.page.getByPlaceholder("~/projects/my-app").fill(projectPath);
    await stave.page.getByRole("button", { name: "Open", exact: true }).click();
    await expect(stave.page.getByTestId("workspace-welcome")).toHaveCount(0);
    await stave.page
      .getByRole("button", { name: "New Task", exact: true })
      .click();
    const editor = stave.page.locator('[data-prompt-lexical-editor="true"]');
    await editor.fill("Review the research and explain the next action. ");
    await editor.evaluate((element) => {
      const samples: number[] = [];
      (
        window as unknown as { composerInputSamples: number[] }
      ).composerInputSamples = samples;
      element.addEventListener("input", () => {
        const start = performance.now();
        requestAnimationFrame(() =>
          requestAnimationFrame(() => samples.push(performance.now() - start)),
        );
      });
    });
    await editor.pressSequentially("Keep the complete goal in view.", {
      delay: 20,
    });
    await expect
      .poll(() =>
        stave.page.evaluate(
          () =>
            (window as unknown as { composerInputSamples: number[] })
              .composerInputSamples.length,
        ),
      )
      .toBeGreaterThan(20);
    const inputToFrameMs = await stave.page.evaluate(
      () =>
        (window as unknown as { composerInputSamples: number[] })
          .composerInputSamples,
    );
    const draft = await editor.innerText();
    await stave.page.getByRole("button", { name: /^Model:/ }).click();
    const selector = stave.page.getByRole("dialog", {
      name: "Model and effort selector",
    });
    await expect(selector).toBeVisible();
    await selector.screenshot({
      animations: "disabled",
      path: testInfo.outputPath("model-selector-dark.png"),
    });
    const grid = selector.getByRole("grid", {
      name: "Model and reasoning effort",
    });
    const selectedCell = grid.locator(
      '[role="gridcell"][aria-selected="true"]',
    );
    await selectedCell.focus();
    await stave.page.keyboard.press("Home");
    await stave.page.keyboard.press("ArrowRight");
    await stave.page.keyboard.press("Enter");
    await expect(selector).toHaveCount(0);
    await expect(editor).toHaveText(draft);
    await stave.page.getByRole("button", { name: /^Model:/ }).click();
    await stave.page.keyboard.press("Escape");
    await expect(editor).toHaveText(draft);
    await stave.page.getByTestId("advisor-mode-pill").click();
    const advisor = stave.page.getByTestId("advisor-mode-options");
    const efforts = advisor.getByRole("radiogroup", {
      name: "Reasoning effort",
    });
    const selectedEffort = efforts.getByRole("radio", { checked: true });
    await selectedEffort.focus();
    await stave.page.keyboard.press("ArrowRight");
    await expect(efforts.getByRole("radio", { checked: true })).toBeFocused();
    await advisor.screenshot({
      animations: "disabled",
      path: testInfo.outputPath("advisor-keyboard-choice.png"),
    });
    await stave.page.keyboard.press("Escape");
    await expect(editor).toHaveText(draft);
    await stave.page.evaluate(() =>
      document.documentElement.classList.remove("dark"),
    );
    await stave.page.setViewportSize({ width: 900, height: 720 });
    await stave.page.getByRole("button", { name: /^Model:/ }).click();
    await expect(selector).toBeVisible();
    const popupGeometry = await selector.evaluate((element) => ({ width: element.clientWidth, scrollWidth: element.scrollWidth }));
    expect(popupGeometry.scrollWidth).toBeLessThanOrEqual(popupGeometry.width + 1);
    await selector.screenshot({
      animations: "disabled",
      path: testInfo.outputPath("model-selector-light-narrow.png"),
    });
    await stave.page.keyboard.press("Escape");
    await expect(editor).toHaveText(draft);
    const reportPath = testInfo.outputPath("composer-response.json");
    await writeFile(
      reportPath,
      JSON.stringify({
        fixture:
          "fresh native task, no provider run; input event to two animation frames",
        inputToFrameMs,
      }),
    );
    await testInfo.attach("composer-response", {
      path: reportPath,
      contentType: "application/json",
    });
    expect(errors).toEqual([]);
  } finally {
    await stave.close();
    await rm(projectPath, { recursive: true, force: true });
  }
});
