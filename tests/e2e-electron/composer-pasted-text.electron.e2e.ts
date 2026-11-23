import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { E2E_WORKSPACE_ID, launchStave, seedRepository } from "./harness/stave-app";

test("a pasted file and its preview survive a renderer reload", async () => {
  const repositoryPath = await mkdtemp(path.join(tmpdir(), "stave-paste-e2e-"));
  const stave = await launchStave();
  const log = ["Worker started", "Reading records", "Writing output", "한".repeat(2100)].join("\n");
  try {
    const { page } = stave;
    await seedRepository(page, { repositoryPath });
    await page.getByRole("button", { name: "New Task", exact: true }).click();
    const editor = page.locator("[data-prompt-lexical-editor]");
    const chip = page.locator("[data-pasted-text-chip]");
    await editor.focus();
    await editor.evaluate((element, text) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", text);
      element.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
    }, log);
    await expect(chip).toContainText("Pasted text · 6.2 KB");
    await expect(editor).toHaveText("");

    const importRoot = path.join(repositoryPath, ".stave", "attachments");
    const [directory] = await readdir(importRoot, { withFileTypes: true }).then((items) => items.filter((item) => item.isDirectory()));
    const relativePath = `.stave/attachments/${directory!.name}/pasted-text.txt`;
    expect(await readFile(path.join(repositoryPath, relativePath), "utf8")).toBe(log);

    await expect.poll(() => page.evaluate(async (workspaceId) => {
      const shell = await window.api!.persistence!.loadWorkspaceShell!({ workspaceId });
      return Object.values(shell.shell?.promptDraftByTask ?? {}).flatMap((draft) => draft.attachedFilePaths);
    }, E2E_WORKSPACE_ID)).toContain(relativePath);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(chip).toContainText("Pasted text · 6.2 KB");
    await expect(chip.locator("pre")).toHaveText("Worker started Reading records Writing output");
    await chip.getByRole("button", { name: "Keep as text" }).click();
    await expect(chip).toHaveCount(0);
    await expect(editor).toHaveText(log, { useInnerText: true });
  } finally {
    await stave.close();
    await rm(repositoryPath, { recursive: true, force: true });
  }
});
