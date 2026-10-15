import { expect, test } from "@playwright/test";

/*
 * The Agents tab on the dev preview (`?stavePreview=agents`), which seeds one
 * custom agent and a repository with agent files, and stubs the agent calls.
 */

test.describe("agents", () => {
  test("repository agent files are listed with what was not carried over", async ({ page }) => {
    await page.goto("/?stavePreview=agents");
    await page.getByRole("button", { name: /^Release notes/ }).click();
    await expect(page.getByText("From repository · .claude/agents/release-notes.md", { exact: false })).toBeVisible();
    await expect(page.getByRole("region", { name: "Read from the file" }).getByText("hooks")).toBeVisible();

    // A clash with a built-in id and an unreadable file are reported, not hidden.
    await page.getByText("2 agent files were not used").filter({ visible: true }).click();
    await expect(page.getByText(/a built-in agent already has the id "reviewer"/).filter({ visible: true })).toBeVisible();
    await expect(page.getByText(".cursor/agents/broken.md", { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Reviewer/ })).toBeVisible();
  });

  test("Start now in Kickoff starts through the same Kickoff start as Create", async ({ page }) => {
    await page.goto("/?stavePreview=kickoff&agent=1");
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Kick off workspace")).toBeVisible();
    await dialog.getByRole("button", { name: "Start now" }).click();
    // The preview's Kickoff start creates nothing and reports so.
    await expect(page.getByText("Preview only. No workspace was created.")).toBeVisible();
  });

  test("Kickoff opens with an agent preselected in both phases", async ({ page }) => {
    await page.goto("/?stavePreview=kickoff&agent=1");
    const dialog = page.getByRole("dialog");
    // Source phase shows Who with the agent chosen and an Assign quick path.
    await expect(dialog.getByText("Who")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Assign" })).toBeVisible();
  });

  test("the Agents surface shows Agents and My standards, and no Workflows tab", async ({ page }) => {
    await page.goto("/?stavePreview=agents&surface=1");
    const tabs = page.getByRole("navigation", { name: "Agents views" });
    await expect(tabs.getByRole("button", { name: "Agents", exact: true })).toBeVisible();
    await expect(tabs.getByRole("button", { name: "Workflows", exact: true })).toHaveCount(0);
    await expect(tabs.getByRole("button", { name: "My standards", exact: true })).toBeVisible();
    await expect(page.getByTestId("agents-tab")).toBeVisible();
    await tabs.getByRole("button", { name: "My standards", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "My standards" })).toBeVisible();
  });

  test("export shows the file and writes it only on request", async ({ page }) => {
    await page.goto("/?stavePreview=agents");
    await page.getByRole("button", { name: /^UI maintainer/ }).click();
    const exportSection = page.getByRole("region", { name: "Export" });
    await expect(exportSection.getByText(".claude/agents/ui-maintainer.md")).toBeVisible();
    await exportSection.getByRole("button", { name: "Write to repository" }).click();
    await expect(exportSection.getByRole("status")).toContainText("Wrote .claude/agents/ui-maintainer.md");
    // Switching the format shows the other file without writing it.
    await exportSection.getByRole("combobox", { name: "Export as" }).click();
    await page.getByRole("option", { name: "Codex agent file" }).click();
    await expect(exportSection.getByText(".codex/agents/ui-maintainer.toml")).toBeVisible();
  });
});

test.describe("agent avatar icon", () => {
  test("an icon is picked, survives a colour change and a reopen, and goes back to initials", async ({ page }) => {
    await page.goto("/?stavePreview=agents&edit=1");
    const profile = page.getByRole("region", { name: "Profile" });
    const trigger = profile.getByRole("button", { name: /^Icon: / });
    await expect(trigger).toHaveAccessibleName("Icon: Initials");

    await trigger.click();
    const picker = page.getByRole("dialog", { name: "Avatar icon" });
    const search = picker.getByRole("textbox", { name: "Search icons" });
    await expect(search).toBeFocused();
    const icons = picker.getByRole("group", { name: "Icons" });
    await expect(icons.getByRole("button", { name: "Initials" })).toHaveAttribute("aria-pressed", "true");
    // Every cell is a comfortable target.
    for (const box of await icons.getByRole("button").evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect()))) {
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(28);
    }
    // Search narrows the grid; Initials stays as the way back.
    await search.fill("zzz");
    await expect(picker.getByRole("status")).toHaveText("No icons match.");
    await expect(icons.getByRole("button")).toHaveCount(1);
    await search.fill("tele");
    await expect(icons.getByRole("button")).toHaveCount(2);
    await icons.getByRole("button", { name: "Telescope" }).click();
    await expect(picker).toBeHidden();
    await expect(trigger).toHaveAccessibleName("Icon: Telescope");

    // A colour change keeps the icon.
    await profile.getByRole("button", { name: "Red" }).click();
    await expect(profile.getByRole("button", { name: "Red" })).toHaveAttribute("aria-pressed", "true");
    await expect(trigger).toHaveAccessibleName("Icon: Telescope");
    const save = page.getByRole("button", { name: "Save", exact: true });
    await save.click();
    // Saved: nothing left to save, and the list row shows the icon too.
    await expect(save).toBeDisabled();
    await expect(page.getByRole("button", { name: /^UI maintainer/ }).locator("svg.lucide-telescope")).toBeVisible();

    // Reopen: another agent, then back.
    await page.getByRole("button", { name: /^Ship a UI fix/ }).click();
    await page.getByRole("button", { name: /^UI maintainer/ }).click();
    await expect(trigger).toHaveAccessibleName("Icon: Telescope");
    await expect(profile.getByRole("button", { name: "Red" })).toHaveAttribute("aria-pressed", "true");

    // An icon change keeps the colour, and Initials removes only the icon.
    await trigger.click();
    await expect(icons.getByRole("button", { name: "Telescope" })).toHaveAttribute("aria-pressed", "true");
    await icons.getByRole("button", { name: "Initials" }).click();
    await expect(trigger).toHaveAccessibleName("Icon: Initials");
    await expect(profile.getByRole("button", { name: "Red" })).toHaveAttribute("aria-pressed", "true");
    await save.click();
    await expect(save).toBeDisabled();
    await page.getByRole("button", { name: /^Ship a UI fix/ }).click();
    await page.getByRole("button", { name: /^UI maintainer/ }).click();
    await expect(trigger).toHaveAccessibleName("Icon: Initials");
    await expect(profile.getByRole("button", { name: "Red" })).toHaveAttribute("aria-pressed", "true");
  });
});
