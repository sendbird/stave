import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave, seedRepository } from "./harness/stave-app";

// The editor must come from the app bundle: it works without a network and
// never loads editor code from a public CDN into the renderer.
test("the editor and its TypeScript worker run offline from the bundled Monaco", async () => {
  test.setTimeout(120_000);
  const repositoryPath = await mkdtemp(path.join(tmpdir(), "stave-bundled-monaco-"));
  await mkdir(path.join(repositoryPath, "src"));
  await writeFile(
    path.join(repositoryPath, "src", "sample.ts"),
    "export const answer: number = 42;\nconst broken = ;\n",
  );
  execFileSync("git", ["init", "-q", "-b", "main", repositoryPath]);
  const stave = await launchStave();
  try {
    await seedRepository(stave.page, { repositoryPath });
    await stave.app.evaluate(({ session }) =>
      session.defaultSession.enableNetworkEmulation({ offline: true }),
    );

    await stave.page.getByRole("button", { name: "Explorer", exact: true }).click();
    await stave.page.getByText("src", { exact: true }).first().click();
    await stave.page.getByText("sample.ts", { exact: true }).first().click();

    await expect(stave.page.locator(".monaco-editor").first()).toBeVisible({
      timeout: 30_000,
    });
    // A syntax diagnostic only appears once the TypeScript worker is running.
    await expect(stave.page.locator(".squiggly-error").first()).toBeAttached({
      timeout: 30_000,
    });
    const remoteEditorRequests = await stave.page.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((url) => /^https?:/.test(url) && /monaco|\/vs\//.test(url)),
    );
    expect(remoteEditorRequests).toEqual([]);
  } finally {
    await stave.close();
    await rm(repositoryPath, { recursive: true, force: true });
  }
});
