import { execFileSync } from "node:child_process";
import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { createViewerPdf } from "../fixtures/viewer-pdf";
import { E2E_WORKSPACE_ID, launchStave, seedRepository } from "./harness/stave-app";

test("opens and lazily paints a real PDF in the desktop editor", async () => {
  const repositoryPath = await mkdtemp(path.join(tmpdir(), "stave-view-pdf-"));
  const pdfPath = path.join(repositoryPath, "report.PDF");
  const pdf = createViewerPdf();
  await writeFile(pdfPath, pdf);
  execFileSync("git", ["init", "-q", "-b", "main", repositoryPath]);
  const stave = await launchStave();
  const { page } = stave;
  try {
    await seedRepository(page, { repositoryPath });
    await page.getByRole("button", { name: "Explorer", exact: true }).click();
    await page.getByText("report.PDF", { exact: true }).first().click();
    const viewer = page.getByTestId("pdf-file-viewer");
    await expect(viewer.getByText("12 pages")).toBeVisible();
    const firstCanvas = viewer.getByTestId("pdf-page").first().locator("canvas");
    await expect(firstCanvas).toBeVisible();
    await expect.poll(async () =>
      firstCanvas.evaluate((canvas: HTMLCanvasElement) => {
        const data = canvas.getContext("2d")?.getImageData(canvas.width * 0.25, canvas.height * 0.25, 1, 1).data;
        return data ? data[2]! > data[0]! + 100 && data[3] === 255 : false;
      }),
    ).toBe(true);

    const last = viewer.getByTestId("pdf-page").last();
    await expect(last.locator("canvas")).toHaveCount(0);
    await last.scrollIntoViewIfNeeded();
    await expect(last.locator("canvas")).toBeVisible();
    await expect(firstCanvas).toHaveCount(0);
    await viewer.getByRole("button", { name: "Actual size" }).click();
    await expect(viewer.getByRole("button", { name: "Actual size" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => (await last.boundingBox())?.width).toBe(400);

    await page.keyboard.press("ControlOrMeta+s");
    expect(await readFile(pdfPath, "utf8")).toBe(pdf);
  } finally {
    await stave.close();
    await rm(repositoryPath, { recursive: true, force: true });
  }
});

test("opens a numbered chat link in the large log reader, searches and follows disk output", async () => {
  test.setTimeout(120_000);
  const repositoryPath = await mkdtemp(path.join(tmpdir(), "stave-view-log-"));
  const logPath = path.join(repositoryPath, "output.log");
  const line = 9001;
  const ordinary = "worker heartbeat " + ".".repeat(100) + "\n";
  await writeFile(logPath, ordinary.repeat(line - 1) + "\x1b[31mlinked error\x1b[0m\n" + ordinary.repeat(2000) + "only match here\n");
  const smallPath = path.join(repositoryPath, "small.log");
  await writeFile(smallPath, ("editable output " + ".".repeat(1007) + "\n").repeat(1024));
  execFileSync("git", ["init", "-q", "-b", "main", repositoryPath]);
  const stave = await launchStave();
  const { page } = stave;
  try {
    await seedRepository(page, { repositoryPath });
    await page.getByRole("button", { name: "New Task", exact: true }).first().click();
    await expect.poll(() =>
      page.evaluate(async (workspaceId) =>
        (await window.api!.persistence!.loadWorkspaceShell!({ workspaceId })).shell?.tasks.length ?? 0,
      E2E_WORKSPACE_ID),
    ).toBe(1);
    const saved = await page.evaluate(async ({ line, workspaceId }) => {
      const persistence = window.api!.persistence!;
      const { shell } = await persistence.loadWorkspaceShell!({ workspaceId });
      if (!shell?.activeTaskId) throw new Error("Missing test task");
      const text = `Open [linked error](output.log#L${line}).`;
      return persistence.upsertWorkspace!({
        id: workspaceId,
        name: "File viewer fixture",
        snapshot: {
          ...shell,
          messagesByTask: {
            [shell.activeTaskId]: [{
              id: "log-file-link",
              role: "assistant",
              providerId: "codex",
              model: "gpt-test",
              content: text,
              parts: [{ type: "text", text }],
              startedAt: "2026-11-01T00:00:00.000Z",
              completedAt: "2026-11-01T00:00:01.000Z",
            }],
          },
        },
      });
    }, { line, workspaceId: E2E_WORKSPACE_ID });
    expect(saved.ok).toBe(true);
    await page.reload();
    await page.getByRole("link", { name: "Open output.log (reference L9001)" }).click();

    const viewer = page.getByTestId("log-file-viewer");
    await expect(viewer.locator("mark")).toHaveText("linked error");
    await expect(viewer.locator("mark")).toBeInViewport();
    await viewer.getByRole("searchbox", { name: "Find in file" }).fill("only match here");
    await viewer.getByRole("button", { name: "Find next" }).click();
    await expect(viewer.locator("mark")).toHaveText("only match here");

    const followTail = viewer.getByRole("button", { name: "Follow tail" });
    await followTail.click();
    await expect(followTail).toHaveAttribute("aria-pressed", "true");
    await appendFile(logPath, "new tail output\n");
    await expect(viewer.getByRole("region", { name: "Log content" })).toContainText("new tail output");
    await expect.poll(() => viewer.locator("pre").evaluate((pre) => {
      const region = pre.parentElement!;
      return region.scrollHeight - region.clientHeight - region.scrollTop;
    })).toBeLessThanOrEqual(1);
    await followTail.click();
    await appendFile(logPath, "paused output\n");
    await viewer.getByRole("button", { name: "Previous chunk" }).click();
    await expect(viewer.getByRole("status")).toHaveText(/The file changed on disk/);
    await expect(viewer.locator("pre")).not.toContainText("paused output");

    const explorer = page.getByRole("button", { name: "Explorer", exact: true });
    const smallFile = page.getByTestId("editor-panel").getByText("small.log", { exact: true });
    if (!(await smallFile.isVisible())) await explorer.click();
    await smallFile.click();
    await expect(page.locator('[data-testid="editor-surface"] .monaco-editor')).toBeVisible();
    await appendFile(smallPath, "one more line\n");
    await smallFile.click();
    await expect(page.getByTestId("log-file-viewer").filter({ visible: true }).locator("pre"))
      .toContainText("editable output");
  } finally {
    await stave.close();
    await rm(repositoryPath, { recursive: true, force: true });
  }
});
