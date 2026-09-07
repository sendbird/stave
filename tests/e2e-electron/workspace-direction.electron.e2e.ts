import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave, type StaveApp } from "./harness/stave-app";

test("maintained direction and an unsaved draft survive a full application restart", async ({}, testInfo) => {
  const projectPath = await mkdtemp(
    path.join(tmpdir(), "stave-direction-project-"),
  );
  const userDataDir = await mkdtemp(
    path.join(tmpdir(), "stave-direction-profile-"),
  );
  let stave: StaveApp | null = await launchStave({ userDataDir });
  const errors: string[] = [];
  const listen = () =>
    stave!.page.on("pageerror", (error) => errors.push(error.message));
  listen();
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
    await expect(stave.page.getByTestId("task-start-guide")).toBeVisible();
    await stave.page
      .getByRole("button", { name: "Information", exact: true })
      .click();
    const direction = () =>
      stave!.page.getByRole("region", { name: "Shared instructions" });
    await direction()
      .getByRole("button", { name: "Add instructions", exact: true })
      .click();
    await direction()
      .getByLabel("Instructions for all tasks", { exact: true })
      .fill("Preserve keyboard shortcuts and verify recovery after restart.");
    await direction()
      .getByRole("button", { name: "Save instructions", exact: true })
      .click();
    await expect(
      direction().getByRole("button", {
        name: "Edit instructions",
        exact: true,
      }),
    ).toBeVisible();
    await direction()
      .getByRole("button", { name: "Edit instructions", exact: true })
      .click();
    await direction()
      .getByLabel("Instructions for all tasks", { exact: true })
      .fill("Unsaved follow-up: inspect Lens recovery.");
    await expect(
      direction().getByText("Draft saved on this device", { exact: true }),
    ).toBeVisible();
    const toggle = direction().getByRole("button", {
      name: "Shared instructions",
      exact: true,
    });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(
      direction().getByLabel("Instructions for all tasks", { exact: true }),
    ).toBeHidden();
    await toggle.focus();
    await stave.page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(
      direction().getByLabel("Instructions for all tasks", { exact: true }),
    ).toHaveValue("Unsaved follow-up: inspect Lens recovery.");
    await expect
      .poll(() =>
        stave!.page.evaluate(
          async () =>
            (await window.api.persistence!.loadProjectRegistry!())
              .activeProjectPath,
        ),
      )
      .toBe(projectPath);
    await stave.close();
    stave = null;
    stave = await launchStave({ userDataDir });
    listen();
    await expect(stave.page.getByTestId("task-start-guide")).toBeVisible();
    await stave.page
      .getByRole("button", { name: "Review shared instructions", exact: true })
      .click();
    await expect(
      direction().getByLabel("Instructions for all tasks", { exact: true }),
    ).toHaveValue("Unsaved follow-up: inspect Lens recovery.");
    await direction()
      .getByRole("button", { name: "Discard edits", exact: true })
      .click();
    await expect(
      direction().getByText(
        "Preserve keyboard shortcuts and verify recovery after restart.",
        { exact: true },
      ),
    ).toBeVisible();
    await stave.page.screenshot({
      path: testInfo.outputPath("workspace-direction-restored.png"),
    });
    for (const mode of ["light", "dark"] as const) {
      await stave.page.evaluate((theme) => {
        document.documentElement.classList.toggle("dark", theme === "dark");
      }, mode);
      await stave.page.screenshot({
        path: testInfo.outputPath(`instructions-${mode}-expanded.png`),
      });
      const heading = direction().getByRole("button", {
        name: "Shared instructions",
        exact: true,
      });
      await heading.click();
      await expect(heading).toHaveAttribute("aria-expanded", "false");
      await expect(
        direction().getByRole("button", {
          name: "Edit instructions",
          exact: true,
        }),
      ).toBeHidden();
      await expect(
        direction().getByText("Saved instructions are included", {
          exact: false,
        }),
      ).toBeHidden();
      await stave.page.screenshot({
        path: testInfo.outputPath(`instructions-${mode}-collapsed.png`),
      });
      await heading.click();
    }
    expect(errors).toEqual([]);
  } catch (error) {
    await stave?.page.screenshot({
      path: testInfo.outputPath("workspace-direction-failure.png"),
    });
    throw error;
  } finally {
    await stave?.close();
    await rm(projectPath, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200,
    });
    await rm(userDataDir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200,
    });
  }
});
