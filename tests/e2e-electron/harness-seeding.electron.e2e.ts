import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave, seedRepository } from "./harness/stave-app";

test("repository seeding replaces a warm renderer's project and survives a later reload", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "stave-seeding-e2e-"));
  const first = path.join(directory, "first");
  const second = path.join(directory, "second");
  const stave = await launchStave();
  try {
    await Promise.all([mkdir(first), mkdir(second)]);
    await seedRepository(stave.page, { repositoryPath: first });
    await expect.poll(() => stave.page.evaluate(async () =>
      (await window.api!.persistence!.loadRepositoryRegistry!()).activeRepositoryPath)).toBe(first);
    // A warm renderer has pending UI persistence to flush on beforeunload.
    await stave.page.getByRole("button", { name: "Tars", exact: true }).click();
    await seedRepository(stave.page, { repositoryPath: second });
    await expect.poll(() => stave.page.evaluate(async () =>
      (await window.api!.persistence!.loadRepositoryRegistry!()).activeRepositoryPath)).toBe(second);
    await stave.page.reload({ waitUntil: "domcontentloaded" });
    await expect.poll(() => stave.page.evaluate(async () =>
      (await window.api!.persistence!.loadRepositoryRegistry!()).activeRepositoryPath)).toBe(second);
  } finally {
    await stave.close();
    await rm(directory, { recursive: true, force: true });
  }
});
