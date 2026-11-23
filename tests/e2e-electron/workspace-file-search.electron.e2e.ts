import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave, seedRepository } from "./harness/stave-app";

test("Explorer searches multiline literals through the desktop bridge", async () => {
  test.setTimeout(120_000);
  const repositoryPath = await mkdtemp(path.join(tmpdir(), "stave-file-search-"));
  const query = "const markers = [1];\n  return markers;";
  try {
    execFileSync("git", ["init", "-q", "-b", "main", repositoryPath]);
    await writeFile(path.join(repositoryPath, "matched.ts"), query + "\n");
    await writeFile(path.join(repositoryPath, "different.ts"), query.replace("  return", "return") + "\n");
    const stave = await launchStave();
    try {
      const { page } = stave;
      await seedRepository(page, { repositoryPath });
      await page.getByRole("button", { name: "Explorer", exact: true }).click();
      await page.getByRole("button", { name: "Search in files", exact: true }).click();
      const input = page.locator("[data-explorer-search-input]");
      await input.fill(query);
      await expect(page.getByText("matched.ts", { exact: true })).toBeVisible();
      await expect(page.getByText("different.ts", { exact: true })).toHaveCount(0);
      await expect(page.getByText("1-2", { exact: true })).toBeVisible();
    } finally {
      await stave.close();
    }
  } finally {
    await rm(repositoryPath, { recursive: true, force: true });
  }
});
