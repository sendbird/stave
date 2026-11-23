import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave } from "./harness/stave-app";

test("displays real macOS listeners and opens the manually started server in Lens", async ({}, testInfo) => {
  test.skip(process.platform !== "darwin", "Uses the macOS lsof backend");
  const repositoryPath = await realpath(await mkdtemp(path.join(tmpdir(), "stave-ports-flow-")));
  const fixture = path.join(repositoryPath, "server.cjs");
  const executable = "'" + process.execPath.replaceAll("'", "'\\''") + "'";
  await mkdir(path.join(repositoryPath, ".stave"));
  await writeFile(path.join(repositoryPath, ".stave/scripts.json"), JSON.stringify({
    version: 2,
    services: { fixture: { label: "Script fixture", commands: [`${executable} ./server.cjs script`], target: "workspace" } },
  }));
  await writeFile(fixture, `
    const { createServer } = require("node:http");
    const { writeFileSync } = require("node:fs");
    const kind = process.argv[2];
    const server = createServer((req, res) => {
      if (req.url === "/") writeFileSync(kind + ".hit", "Lens requested the page");
      res.end("<title>Workspace port fixture</title>Workspace port fixture");
    });
    server.listen(0, "127.0.0.1", () => writeFileSync(kind + ".port", String(server.address().port)));
  `);
  const server = spawn(process.execPath, [fixture, "external"], { cwd: repositoryPath, stdio: "ignore" });
  let stave: Awaited<ReturnType<typeof launchStave>> | undefined;
  let sessionId: string | undefined;
  let workspaceId: string | undefined;
  try {
    stave = await launchStave();
    const { page } = stave;
    await page.getByTestId("workspace-welcome").getByRole("button", { name: "Open repository" }).click();
    await page.getByPlaceholder("~/projects/my-app").fill(repositoryPath);
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await expect(page.getByTestId("workspace-welcome")).toHaveCount(0, { timeout: 15_000 });

    const readPort = (kind: string) => readFile(path.join(repositoryPath, kind + ".port"), "utf8").catch(() => "");
    await expect.poll(() => readPort("external")).toMatch(/^\d+$/);
    const externalPort = await readPort("external");
    await expect.poll(async () => {
      workspaceId = await page.evaluate(async (repositoryPath) => {
        const registry = await window.api.persistence!.loadRepositoryRegistry!();
        const repositories = registry.repositories as Array<{ repositoryPath: string; activeWorkspaceId: string }>;
        return repositories.find((candidate) => candidate.repositoryPath === repositoryPath)?.activeWorkspaceId;
      }, repositoryPath);
      return workspaceId;
    }).toBeTruthy();
    const terminal = await page.evaluate(({ repositoryPath, workspaceId }) =>
      window.api.terminal!.createSession!({
        workspaceId: workspaceId!, workspacePath: repositoryPath, taskId: null, taskTitle: null,
        terminalTabId: "ports-fixture", cwd: repositoryPath,
      }), { repositoryPath, workspaceId },
    );
    expect(terminal.ok).toBe(true);
    sessionId = terminal.sessionId;
    const write = await page.evaluate(({ sessionId, executable }) =>
      window.api.terminal!.writeSession!({ sessionId: sessionId!, input: `${executable} ./server.cjs pty\r` }),
      { sessionId, executable },
    );
    expect(write.ok).toBe(true);
    await expect.poll(() => readPort("pty")).toMatch(/^\d+$/);
    const ptyPort = await readPort("pty");
    const script = await page.evaluate(({ workspaceId, repositoryPath }) =>
      window.api.scripts!.runEntry!({
        workspaceId: workspaceId!, repositoryPath, workspacePath: repositoryPath,
        scriptId: "fixture", scriptKind: "service", workspaceName: "fixture", branch: "main",
      }), { workspaceId, repositoryPath },
    );
    expect(script.ok, script.error).toBe(true);
    await expect.poll(() => readPort("script")).toMatch(/^\d+$/);
    const scriptPort = await readPort("script");

    await page.getByRole("button", { name: /^Workspace Tools/ }).click();
    const ports = page.getByRole("region", { name: "Listening ports", exact: true });
    const inferredAction = ports.getByRole("button", { name: `Open 127.0.0.1:${externalPort} in Lens` });
    const ownedAction = ports.getByRole("button", { name: `Open 127.0.0.1:${ptyPort} in Lens` });
    await expect(inferredAction.locator("..")).toContainText("Inferred");
    await expect(ownedAction.locator("..")).toContainText("Owned by Stave");
    await expect(ports.getByRole("button", { name: `Open 127.0.0.1:${scriptPort} in Lens` }).locator(".."))
      .toContainText("Owned by Stave");
    await expect(ports.getByRole("button", { name: /^Stop/ })).toHaveCount(0);
    await ports.screenshot({ path: testInfo.outputPath("live-workspace-ports.png") });

    await inferredAction.click();
    await expect(page.getByTestId("lens-surface-panel")).toBeVisible();
    await expect.poll(() => readFile(path.join(repositoryPath, "external.hit"), "utf8").catch(() => ""))
      .toBe("Lens requested the page");
  } finally {
    server.kill();
    if (sessionId) {
      await stave?.page.evaluate((sessionId) => window.api.terminal!.closeSession!({ sessionId }), sessionId).catch(() => {});
    }
    if (workspaceId) {
      await stave?.page.evaluate((workspaceId) => window.api.scripts!.stopEntry!({
        workspaceId, scriptId: "fixture", scriptKind: "service",
      }), workspaceId).catch(() => {});
    }
    await stave?.close();
    await rm(repositoryPath, { recursive: true, force: true });
  }
});
