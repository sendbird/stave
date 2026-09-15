import { createServer } from "node:http";
import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchStave, seedProject, openLensSurface, E2E_WORKSPACE_ID, E2E_LENS_SESSION_ID, type StaveApp } from "./harness/stave-app";

test.describe("runtime resource metrics", () => {
  let stave: StaveApp;

  test.beforeEach(async () => {
    stave = await launchStave();
  });

  test.afterEach(async () => {
    await stave.close();
  });

  test("keep-active crosses the real bridge and protects a hidden Lens guest", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stave-resource-test-"));
    try {
      await seedProject(stave.page, { projectPath: directory });
      await openLensSurface(stave.page);
      const target = { workspaceId: E2E_WORKSPACE_ID, lensSessionId: E2E_LENS_SESSION_ID };
      await expect.poll(() => stave.page.evaluate(async (target) => (await window.api.lens?.setKeepActive?.({ ...target, keepActive: true }))?.ok, target)).toBe(true);
      const result = await stave.page.evaluate(async (target) => {
        await window.api.lens?.setPresented?.({ ...target, presented: false });
        const released = await window.api.lens?.releaseWorkspaceGuests?.({ workspaceId: target.workspaceId });
        const metrics = await window.api.metrics?.getAppMetrics?.();
        return { released, guest: metrics?.lens.guests.find((guest) => guest.workspaceId === target.workspaceId && guest.lensSessionId === target.lensSessionId) };
      }, target);
      expect(result.released?.released).toBe(0);
      expect(result.guest?.keptActive).toBe(true);
      expect(result.guest?.protectionReasons).toContain("Always keep active");
      expect(await stave.page.evaluate(async (target) => (await window.api.lens?.setKeepActive?.({ ...target, keepActive: false }))?.ok, target)).toBe(true);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test("stops only the selected workspace and requires resume before a new terminal", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stave-stop-test-"));
    try {
      await seedProject(stave.page, { projectPath: directory });
      const result = await stave.page.evaluate(async ({ directory, workspaceId }) => {
        await window.api.persistence!.saveProjectRegistry!({ projects: [{
          projectPath: directory, projectName: "e2e", lastOpenedAt: new Date().toISOString(), defaultBranch: "main",
          workspaces: [{ id: workspaceId, name: "e2e", updatedAt: new Date().toISOString() }], activeWorkspaceId: workspaceId,
          workspaceBranchById: { [workspaceId]: "main" }, workspacePathById: { [workspaceId]: directory }, workspaceDefaultById: { [workspaceId]: true },
        }], activeProjectPath: directory });
        const args = { workspaceId, workspacePath: directory, taskId: null, taskTitle: null, terminalTabId: "resource-test", cwd: directory };
        const terminal = await window.api.terminal!.createSession!(args);
        const foreign = await window.api.terminal!.createSession!({ ...args, workspaceId: workspaceId + ":other" });
        const stopped = await window.api.workspaceExecution!.update({ workspaceId, workspacePath: directory, action: "stop" });
        const blocked = await window.api.terminal!.createSession!({ ...args, terminalTabId: "blocked" });
        const gone = await window.api.terminal!.writeSession!({ sessionId: terminal.sessionId!, input: "" });
        const retained = await window.api.terminal!.writeSession!({ sessionId: foreign.sessionId!, input: "" });
        const resumed = await window.api.workspaceExecution!.update({ workspaceId, workspacePath: directory, action: "resume" });
        const restarted = await window.api.terminal!.createSession!(args);
        return { terminal, stopped, blocked, gone, retained, resumed, restarted };
      }, { directory, workspaceId: E2E_WORKSPACE_ID });
      expect(result.stopped, JSON.stringify(result)).toMatchObject({ ok: true });
      expect(result.blocked.ok).toBe(false);
      expect(result.gone.ok).toBe(false);
      expect(result.retained.ok).toBe(true);
      expect(result.resumed.ok).toBe(true);
      expect(result.restarted.ok).toBe(true);
      expect(result.restarted.sessionId).not.toBe(result.terminal.sessionId);
      await stave.page.getByLabel("memory-usage").click();
      await stave.page.getByText("Workspace execution", { exact: true }).click();
      await expect(stave.page.getByRole("button", { name: "Stop execution", exact: true })).toBeVisible();
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test("sleep retains input and scroll, and the next Lens command wakes the page", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stave-sleep-test-"));
    const server = createServer((_request, response) => {
      response.setHeader("Content-Type", "text/html");
      response.end('<input id="draft"><div style="height:4000px">Page state fixture</div>');
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Fixture server failed");
    try {
      await seedProject(stave.page, { projectPath: directory, settings: { lensCdpApprovedHosts: ["127.0.0.1"], lensDeveloperModeCdp: true } });
      await openLensSurface(stave.page);
      const target = { workspaceId: E2E_WORKSPACE_ID, lensSessionId: E2E_LENS_SESSION_ID };
      await stave.page.evaluate(async ({ target, url }) => {
        await window.api.lens!.navigate!({ ...target, url });
      }, { target, url: `http://127.0.0.1:${address.port}` });
      await expect.poll(() => stave.page.evaluate(async (target) => (await window.api.lens!.getState!(target)).state?.isLoading, target)).toBe(false);
      const setup = await stave.page.evaluate(async (target) => window.api.lens!.evaluate!({ ...target, expression: 'document.querySelector("#draft").value = "unsaved draft"; window.scrollTo(0, 500); window.savedMarker = 42; true' }), target);
      expect(setup.ok, JSON.stringify(setup)).toBe(true);
      await stave.page.evaluate(async (target) => window.api.lens!.setPresented!({ ...target, presented: false }), target);
      for (let cycle = 0; cycle < 3; cycle++) {
        const sleeping = await stave.page.evaluate(async (target) => window.api.lens!.setSleeping!({ ...target, sleeping: true }), target);
        expect(sleeping, JSON.stringify(sleeping)).toMatchObject({ ok: true });
        const state = await stave.page.evaluate(async () => window.api.metrics!.getAppMetrics!());
        expect(state.lens.guests.find((guest) => guest.workspaceId === E2E_WORKSPACE_ID)?.sleeping).toBe(true);
        const value = await stave.page.evaluate(async (target) => window.api.lens!.evaluate!({ ...target, expression: '({ draft: document.querySelector("#draft").value, scroll: window.scrollY, marker: window.savedMarker })' }), target);
        expect(value.result).toEqual({ draft: "unsaved draft", scroll: 500, marker: 42 });
      }
      await stave.page.evaluate(async (target) => window.api.lens!.setSleeping!({ ...target, sleeping: true }), target);
      const shot = await stave.page.evaluate(async (target) => window.api.lens!.screenshot!(target), target);
      expect(shot.ok, shot.message).toBe(true);
      expect(shot.dataUrl).toMatch(/^data:image/);
      await stave.page.evaluate(async (target) => window.api.lens!.setSleeping!({ ...target, sleeping: true }), target);
      await stave.page.evaluate(async (target) => window.api.lens!.setPresented!({ ...target, presented: true }), target);
      await expect.poll(() => stave.page.evaluate(async () => (await window.api.metrics!.getAppMetrics!()).lens.guests.find((guest) => guest.workspaceId === "ws-e2e")?.sleeping)).toBe(false);
    } finally {
      server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("attributes processes and renders the extended resource summary", async () => {
    await expect
      .poll(
        async () => {
          const result = await stave.page.evaluate(() =>
            window.api.metrics?.getAppMetrics?.(),
          );
          return result?.hostService?.pid ?? 0;
        },
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0);
    const metrics = await stave.page.evaluate(() =>
      window.api.metrics?.getAppMetrics?.(),
    );
    const rendererMemory = await stave.page.evaluate(() =>
      window.api.metrics?.getRendererMemory?.(),
    );

    expect(metrics?.hostRendererPid).toBeGreaterThan(0);
    expect(
      metrics?.processes.some((process) => process.role === "host-renderer"),
    ).toBe(true);
    expect(rendererMemory?.heap.usedHeapSize).toBeGreaterThan(0);

    await stave.page.getByLabel("memory-usage").click();
    await expect(stave.page.getByRole("region", { name: "Resource manager", exact: true })).toBeVisible();
    await stave.page.getByText("Memory diagnostics and storage", { exact: true }).click();
    await expect(stave.page.getByText("Renderer heap")).toBeVisible();
    await expect(stave.page.getByText("Host service", { exact: true })).toBeVisible();
    await expect(stave.page.getByText("Lens resources")).toBeVisible();
    await expect(stave.page.locator("body")).not.toContainText("NaN");
  });
});
