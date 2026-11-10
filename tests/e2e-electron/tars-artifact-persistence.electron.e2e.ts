import { expect, test, type Page } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, readFile, chmod, rm, stat, realpath } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { launchStave, seedRepository } from "./harness/stave-app";

async function openSaved(page: Page, title: string, surface: "outputs" | "report") {
  const links = surface === "outputs" ? page.locator('[data-tars-tray] [data-tars-output="link"]') : page.locator('[data-tars-report] [data-saved-html-open]');
  if (surface === "outputs") await links.filter({ hasText: title }).getByRole("button").click();
  else await links.filter({ hasText: title }).click();
  const dialog = page.getByRole("dialog");
  const frame = dialog.frameLocator(`iframe[title="${title}"]`);
  await expect(frame.locator("h1")).toHaveText(title);
  await expect(frame.locator("h1")).toHaveAttribute("data-loaded", "yes");
  await expect(frame.locator("html")).toHaveAttribute("data-async", "yes");
  expect(await frame.locator("h1").evaluate(() => (window as unknown as { savedLabel: string }).savedLabel)).toBe("export 한글");
  await expect(frame.locator("h1")).toHaveCSS("color", "rgb(51, 85, 170)");
  await expect.poll(() => frame.locator("img").evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
}

test("real host grant/report receipt freezes HTML, main reads it, and Tars opens it after source deletion and restart", async ({}, testInfo) => {
  test.setTimeout(240_000);
  expect((await stat(path.join(import.meta.dirname, "../../out/main/host-service.js"))).size, "desktop host entry must contain executable code").toBeGreaterThan(0);
  const root = await mkdtemp(path.join(tmpdir(), "stave-saved-report-e2e-"));
  const repositoryPath = path.join(root, "repository"), userDataDir = path.join(root, "profile"), fakeDir = path.join(root, "fixture-cli");
  await Promise.all([mkdir(repositoryPath), mkdir(userDataDir), mkdir(fakeDir)]);
  execFileSync("git", ["init", "-b", "main"], { cwd: repositoryPath });
  await writeFile(path.join(repositoryPath, "README.md"), "Static report persistence fixture.\n");
  execFileSync("git", ["add", "README.md"], { cwd: repositoryPath });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "test: initialize"], { cwd: repositoryPath });
  const wrapper = path.join(fakeDir, "claude");
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  await writeFile(wrapper, `#!/bin/sh\nFAKE_CLAUDE_ARTIFACT_REPORT=1 FAKE_CLAUDE_DIR=${quote(fakeDir)} exec ${quote(process.execPath)} ${quote(path.join(import.meta.dirname, "harness/fake-claude-cli.cjs"))} "$@"\n`);
  await chmod(wrapper, 0o755);
  const env = { STAVE_CLAUDE_CLI_PATH: wrapper, STAVE_DEV: "1" };
  let app = await launchStave({ userDataDir, env });
  const hostErrors: string[] = [];
  app.app.process().stderr?.on("data", (chunk) => {
    const lines = String(chunk).split("\n").filter((line) => /host-service.*(?:exit|shutdown|fatal|Error|error)/i.test(line));
    hostErrors.push(...lines);
  });
  try {
    await seedRepository(app.page, { repositoryPath, settings: { autoRoutingEnabled: false, themeMode: "dark", locale: "en" } });
    const created = await app.page.evaluate((repositoryPath) => window.api!.tars!.create({ requestId: "archive-fixture", title: "Saved comparison fixture", instruction: "Report the fixture static exports.", acceptanceCriteria: ["Static exports saved."], workspaceId: "ws-e2e", repositoryPath, providerId: "claude-code", model: "sonnet", maxTurns: 4, priority: 50 }), repositoryPath);
    const id = created.responsibilities[0]!.id;
    await expect.poll(async () => {
      if (existsSync(path.join(fakeDir, "artifact-error"))) throw new Error(await readFile(path.join(fakeDir, "artifact-error"), "utf8"));
      return existsSync(path.join(fakeDir, "artifact-reported"));
    }, { timeout: 90_000 }).toBe(true);
    let row = (await app.page.evaluate(() => window.api!.tars!.get())).responsibilities.find((entry) => entry.id === id)!;
    const detail = await app.page.evaluate((agentRunId) => window.api!.agentRuns!.get({ agentRunId }), row.agentRunId!);
    expect(detail.agentRun!.stages.flatMap((stage) => stage.report?.outcome === "complete" ? stage.report.artifacts : [])).toHaveLength(2);
    await app.page.evaluate((row) => window.api!.tars!.act({ requestId: "freeze-fixture", responsibilityId: row.id, expectedRevision: row.revision, operation: "cancel", source: "click" }), row);
    await expect.poll(async () => (await app.page.evaluate((agentRunId) => window.api!.agentRuns!.get({ agentRunId }), row.agentRunId!)).agentRun?.report?.links.length).toBe(2);
    // Prove main and the inherited host environment address the same isolated profile.
    const actualUserData = await app.app.evaluate(({ app }) => app.getPath("userData"));
    expect(await realpath(actualUserData)).toBe(await realpath(userDataDir));
    const frozen = (await app.page.evaluate((agentRunId) => window.api!.agentRuns!.get({ agentRunId }), row.agentRunId!)).agentRun!.report!;
    for (const link of frozen.links) {
      const result = await app.page.evaluate((url) => window.api!.inlineRender!.readSource({ renderId: new URL(url).pathname.slice(1) }), link.url);
      expect(result.ok).toBe(true);
    }
    const source = JSON.parse(await readFile(path.join(fakeDir, "artifact-reported"), "utf8")).cwd as string;
    expect(source).not.toBe(repositoryPath);
    const server = createServer((_request, response) => response.end("temporary live preview"));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    expect((await fetch(url)).ok).toBe(true);
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await expect(fetch(url)).rejects.toThrow();
    await app.close();
    // Remove the real execution worktree, not the profile or source repository.
    await rm(source, { recursive: true });
    app = await launchStave({ userDataDir, env });
    // Actual product Tars surface; no manual iframe or injected report/store.
    await app.page.getByRole("button", { name: "Tars", exact: true }).click();
    await openSaved(app.page, "Original static export", "outputs");
    if (process.env.STAVE_COLLECT_HTML_EVIDENCE === "1") await app.page.screenshot({ path: testInfo.outputPath("original-after-restart.png") });
    await app.page.keyboard.press("Escape");
    await openSaved(app.page, "Revised static export", "outputs");
    if (process.env.STAVE_COLLECT_HTML_EVIDENCE === "1") await app.page.screenshot({ path: testInfo.outputPath("revised-after-restart.png") });
    await app.page.keyboard.press("Escape");
    await app.page.locator('[data-tars-tray] [data-tars-output="report"]').getByRole("button").click();
    await openSaved(app.page, "Original static export", "report");
  } finally { if (hostErrors.length) await testInfo.attach("host-errors", { body: hostErrors.join("\n"), contentType: "text/plain" }); await app.close(); await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});
