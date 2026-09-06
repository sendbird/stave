import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave } from "./harness/stave-app";

test("workspace tools preserve an unfinished command across views, save it without running, and show its output", async ({}, testInfo) => {
  const projectPath = await mkdtemp(path.join(tmpdir(), "stave-tools-flow-"));
  const stave = await launchStave();
  const errors: string[] = [];
  stave.page.on("pageerror", (error) => errors.push(error.message));
  try {
    await stave.page.getByTestId("workspace-welcome").getByRole("button", { name: "Open a project" }).click();
    await stave.page.getByPlaceholder("~/projects/my-app").fill(projectPath);
    await stave.page.getByRole("button", { name: "Open", exact: true }).click();
    await expect(stave.page.getByTestId("workspace-welcome")).toHaveCount(0, { timeout: 15_000 });
    await stave.page.getByRole("button", { name: "Workspace Tools", exact: true }).click();
    const panel = stave.page.getByRole("region", { name: "Workspace tools", exact: true });
    await panel.getByRole("tab", { name: "Commands", exact: true }).click();
    await panel.getByRole("button", { name: "Add command", exact: true }).click();
    const form = panel.getByRole("form", { name: "Add command" });
    await form.getByLabel("Name", { exact: true }).fill("Check workspace");
    await form.getByLabel("Command", { exact: true }).fill("printf 'workspace tool ready\\n'");
    await panel.getByRole("tab", { name: "Processes", exact: true }).click();
    await expect(form).toBeHidden();
    await panel.getByRole("tab", { name: "Commands", exact: true }).click();
    await expect(form.getByLabel("Name", { exact: true })).toHaveValue("Check workspace");
    await form.getByRole("button", { name: "Save command", exact: true }).click();
    await expect(panel.getByText("Check workspace", { exact: true })).toBeVisible();
    const saved = JSON.parse(await readFile(path.join(projectPath, ".stave/scripts.json"), "utf8"));
    expect(saved.actions["check-workspace"].commands).toEqual(["printf 'workspace tool ready\\n'"]);
    await expect(panel.locator("pre")).toHaveCount(0);
    await panel.getByRole("button", { name: "Run", exact: true }).click();
    await expect(panel.locator("pre")).toContainText("workspace tool ready", { timeout: 15_000 });
    await panel.getByRole("tab", { name: /^Runs/ }).click();
    await expect(panel.getByRole("tabpanel", { name: /^Runs/ }).getByText("Check workspace", { exact: true })).toBeVisible();
    const tabsBox = await panel.getByRole("tablist").boundingBox();
    expect(tabsBox!.height).toBeLessThan(100);
    await panel.getByLabel("Find a workspace tool").fill("no such tool");
    await expect(panel.getByText("No matching commands or processes.")).toBeVisible();
    await expect(panel.locator("pre")).toContainText("workspace tool ready");
    await panel.getByLabel("Find a workspace tool").fill("");
    await panel.getByRole("tab", { name: /^Processes/ }).click();
    await panel.getByLabel("Find a workspace tool").fill("Check workspace");
    await expect(panel.getByRole("region", { name: "Tool search results" }).getByRole("button", { name: "Check workspace", exact: true })).toBeVisible();
    await panel.screenshot({ path: testInfo.outputPath("workspace-tools-search.png") });
    await expect(panel.locator("pre")).toContainText("workspace tool ready");
    await panel.getByLabel("Find a workspace tool").fill("");
    await expect(panel.getByRole("tab", { name: /^Processes/ })).toHaveAttribute("aria-selected", "true");
    await panel.getByRole("tab", { name: /^Runs/ }).click();
    await panel.screenshot({ path: testInfo.outputPath("workspace-tools-panel.png") });
    await stave.page.screenshot({ path: testInfo.outputPath("workspace-command-result.png") });
    expect(errors).toEqual([]);
  } catch (error) {
    await stave.page.screenshot({ path: testInfo.outputPath("workspace-tools-failure.png") });
    throw error;
  } finally {
    await stave.close();
    await rm(projectPath, { recursive: true, force: true });
  }
});
