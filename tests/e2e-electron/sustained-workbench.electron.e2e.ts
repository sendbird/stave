import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave } from "./harness/stave-app";
import { callStaveMcpTool, waitForStaveMcpEndpoint } from "./harness/stave-mcp";

type WorkbenchMetrics = {
  mainRss: number;
  hostRss?: number;
  rendererHeapKB?: number;
  hostTerminalSessions?: number;
  hostPtyPids?: number;
  lensSessions: number;
  lensVisibleSessions: number;
  processes: Array<{
    role: string;
    workingSetKB?: number;
    cpuPercent?: number;
  }>;
};

const DEFAULT_CYCLES = 2;

function readSoakDuration() {
  const raw = process.env.STAVE_SOAK_DURATION_MS;
  if (!raw) return undefined;
  const duration = Number(raw);
  if (!Number.isSafeInteger(duration) || duration <= 0) {
    throw new Error("STAVE_SOAK_DURATION_MS must be a positive integer");
  }
  return duration;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

test("sustained workbench workload records native lifecycle evidence", async ({}, testInfo) => {
  const soakDurationMs = readSoakDuration();
  test.setTimeout(Math.max(120_000, (soakDurationMs ?? 0) + 120_000));

  const projectPath = await mkdtemp(path.join(os.tmpdir(), "stave-workbench-"));
  const reportPath = testInfo.outputPath("sustained-workbench.jsonl");
  await writeFile(reportPath, "");
  await appendFile(
    reportPath,
    `${JSON.stringify({
      kind: "run",
      startedAt: new Date().toISOString(),
      cycles: soakDurationMs ? "duration" : DEFAULT_CYCLES,
      durationMs: soakDurationMs ?? null,
      host: {
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        cpuCount: os.cpus().length,
        totalMemoryBytes: os.totalmem(),
      },
      providerTurns: 0,
      fixture: "local guest page and native shell only",
    })}\n`,
  );

  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    response.end(
      "<!doctype html><title>Sustained fixture</title><main>native workload fixture</main>",
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("No fixture port");
  }

  const stave = await launchStave();
  let reportError: string | undefined;
  try {
    // Establish one real task so the workload can prove that draft and history
    // survive native surface churn without starting a provider turn.
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
    const persistence = await stave.page.evaluate(async () => {
      const { rows } = await window.api.persistence!.listWorkspaces!();
      const workspaceId = rows[0]?.id;
      if (!workspaceId)
        throw new Error("native onboarding created no workspace");
      return { workspaceId };
    });
    await expect
      .poll(
        async () =>
          stave.page.evaluate(async (workspaceId) => {
            const result = await window.api.persistence!.loadWorkspaceShell!({
              workspaceId,
            });
            return result.shell?.tasks.length ?? 0;
          }, persistence.workspaceId),
        { timeout: 15_000 },
      )
      .toBe(1);

    const saved = await stave.page.evaluate(async ({ workspaceId }) => {
      const loaded = await window.api.persistence!.loadWorkspaceShell!({
        workspaceId,
      });
      if (!loaded.shell) throw new Error("workload task did not persist");
      const taskId = loaded.shell.activeTaskId;
      if (!taskId)
        throw new Error("native onboarding created an empty task id");
      const marker = "sustained-workbench-retained";
      const history = [
        {
          id: `${marker}-user`,
          role: "user" as const,
          model: "",
          providerId: "user" as const,
          content: `${marker} user`,
          parts: [],
        },
        {
          id: `${marker}-assistant`,
          role: "assistant" as const,
          model: "fixture",
          providerId: "claude-code" as const,
          content: `${marker} assistant`,
          parts: [],
        },
      ];
      const draft = {
        text: `${marker} draft`,
        attachedFilePaths: [],
        attachments: [],
      };
      const result = await window.api.persistence!.upsertWorkspace!({
        id: workspaceId,
        name: "sustained-workbench",
        snapshot: {
          ...loaded.shell,
          messagesByTask: { [taskId]: history },
          promptDraftByTask: {
            ...loaded.shell.promptDraftByTask,
            [taskId]: draft,
          },
        },
      });
      return { ok: result.ok, taskId, marker };
    }, persistence);
    expect(saved.ok).toBe(true);
    await stave.page.reload({ waitUntil: "domcontentloaded" });

    const endpoint = await waitForStaveMcpEndpoint(stave.userDataDir);
    const readMetrics = async (): Promise<WorkbenchMetrics> =>
      stave.page.evaluate(async () => {
        const app = await window.api.metrics!.getAppMetrics!();
        const memory = await window.api.metrics!.getRendererMemory!();
        return {
          mainRss: app.mainProcess.rss,
          hostRss: app.hostService?.memory.rss,
          rendererHeapKB: memory.heap.usedHeapSize,
          hostTerminalSessions: app.hostService?.terminalSessions,
          hostPtyPids: app.hostService?.ptyPids.length,
          lensSessions: app.lens.sessions,
          lensVisibleSessions: app.lens.visibleSessions,
          processes: app.processes.map((process) => ({
            role: process.role,
            workingSetKB: process.memory.workingSetSizeKB,
            cpuPercent: process.cpu.percentCPUUsage,
          })),
        };
      });

    const baseline = await readMetrics();
    const idleSampleIntervalMs = soakDurationMs ? 10_000 : 1_000;
    const cycleDeadline = soakDurationMs
      ? Date.now() + soakDurationMs
      : Number.POSITIVE_INFINITY;
    let cycle = 0;
    do {
      const lensSessionId = `sustained-${cycle}`;
      const terminalTabId = `sustained-${cycle}`;
      let terminalSessionId: string | undefined;
      let lensOpened = false;
      const cycleStartedAt = performance.now();
      try {
        const lensResult = await callStaveMcpTool(
          endpoint,
          "stave_lens_navigate",
          {
            workspaceId: persistence.workspaceId,
            lensSessionId,
            url: `http://127.0.0.1:${address.port}/?cycle=${cycle}`,
          },
        );
        expect(lensResult.isError).toBe(false);
        lensOpened = true;

        const terminalResult = await stave.page.evaluate(
          async ({ projectPath: cwd, terminalTabId, workspaceId }) => {
            return window.api.terminal!.createSession!({
              workspaceId,
              workspacePath: cwd,
              taskId: null,
              taskTitle: null,
              terminalTabId,
              cwd,
              cols: 100,
              rows: 30,
              deliveryMode: "poll",
            });
          },
          { projectPath, terminalTabId, workspaceId: persistence.workspaceId },
        );
        expect(terminalResult.ok).toBe(true);
        terminalSessionId = terminalResult.sessionId;
        expect(terminalSessionId).toBeTruthy();

        const inputMarker = `workbench-cycle-${cycle + 1000}`;
        const writeResult = await stave.page.evaluate(
          async ({ sessionId, cycle }) =>
            window.api.terminal!.writeSession!({
              sessionId,
              input: `printf 'workbench-cycle-%s\\n' ${cycle + 1000}\n`,
            }),
          { sessionId: terminalSessionId!, cycle },
        );
        expect(writeResult.ok, writeResult.stderr).toBe(true);

        const inputToReadStart = performance.now();
        let terminalOutput = "";
        while (performance.now() - inputToReadStart < 10_000) {
          const readResult = await stave.page.evaluate(
            async (sessionId) =>
              window.api.terminal!.readSession!({ sessionId }),
            terminalSessionId!,
          );
          terminalOutput += readResult.output;
          if (terminalOutput.includes(inputMarker)) break;
          await delay(100);
        }
        const inputToShellReadMs = Math.round(
          performance.now() - inputToReadStart,
        );
        expect(terminalOutput).toContain(inputMarker);

        await expect
          .poll(
            async () => {
              const metrics = await readMetrics();
              return (
                metrics.lensSessions >= baseline.lensSessions + 1 &&
                (metrics.hostTerminalSessions ?? 0) >=
                  (baseline.hostTerminalSessions ?? 0) + 1
              );
            },
            { timeout: 15_000 },
          )
          .toBe(true);
        const opened = await readMetrics();
        expect(opened.lensSessions).toBeLessThanOrEqual(
          baseline.lensSessions + 1,
        );
        expect(opened.hostTerminalSessions).toBeLessThanOrEqual(
          (baseline.hostTerminalSessions ?? 0) + 1,
        );
        expect(opened.hostPtyPids).toBeLessThanOrEqual(
          (baseline.hostPtyPids ?? 0) + 1,
        );

        const openLatencyMs = Math.round(performance.now() - cycleStartedAt);
        const closeStarted = performance.now();
        const closeTerminal = await stave.page.evaluate(
          async (sessionId) =>
            window.api.terminal!.closeSession!({ sessionId }),
          terminalSessionId,
        );
        expect(closeTerminal.ok, closeTerminal.stderr).toBe(true);
        terminalSessionId = undefined;
        const closeLens = await callStaveMcpTool(
          endpoint,
          "stave_lens_close_session",
          { workspaceId: persistence.workspaceId, lensSessionId },
        );
        expect(closeLens.isError).toBe(false);
        lensOpened = false;

        await expect
          .poll(
            async () => {
              const metrics = await readMetrics();
              return {
                lensSessions: metrics.lensSessions,
                hostTerminalSessions: metrics.hostTerminalSessions ?? 0,
                hostPtyPids: metrics.hostPtyPids ?? 0,
              };
            },
            { timeout: 15_000 },
          )
          .toEqual({
            lensSessions: baseline.lensSessions,
            hostTerminalSessions: baseline.hostTerminalSessions ?? 0,
            hostPtyPids: baseline.hostPtyPids ?? 0,
          });
        const afterClose = await readMetrics();
        const retained = await stave.page.evaluate(
          async ({ workspaceId, taskId, marker }) => {
            const shell = await window.api.persistence!.loadWorkspaceShell!({
              workspaceId,
            });
            const page = await window.api.persistence!.loadTaskMessages!({
              workspaceId,
              taskId,
              limit: 10,
              offset: 0,
            });
            return {
              draft: shell.shell?.promptDraftByTask[taskId]?.text ?? null,
              historyCount: page.page?.totalCount ?? 0,
              historyHasMarker:
                page.page?.messages.some((message) =>
                  message.content.includes(marker),
                ) ?? false,
            };
          },
          { ...persistence, taskId: saved.taskId, marker: saved.marker },
        );
        expect(retained.draft).toContain(saved.marker);
        expect(retained.historyCount).toBeGreaterThanOrEqual(2);
        expect(retained.historyHasMarker).toBe(true);

        await appendFile(
          reportPath,
          `${JSON.stringify({
            kind: "cycle",
            cycle,
            openedAt: new Date().toISOString(),
            openLatencyMs,
            inputToShellReadMs,
            closeLatencyMs: Math.round(performance.now() - closeStarted),
            totalCycleMs: Math.round(performance.now() - cycleStartedAt),
            opened,
            afterClose,
            retained,
          })}\n`,
        );
      } finally {
        if (terminalSessionId) {
          await stave.page
            .evaluate(
              async (sessionId) =>
                window.api.terminal!.closeSession!({ sessionId }),
              terminalSessionId,
            )
            .catch(() => {});
        }
        if (lensOpened) {
          await callStaveMcpTool(endpoint, "stave_lens_close_session", {
            workspaceId: persistence.workspaceId,
            lensSessionId,
          }).catch(() => {});
        }
      }
      await delay(idleSampleIntervalMs);
      const idle = await readMetrics();
      await appendFile(
        reportPath,
        `${JSON.stringify({
          kind: "idle",
          cycle,
          sampledAt: new Date().toISOString(),
          idle,
        })}\n`,
      );
      cycle += 1;
    } while (
      cycle < DEFAULT_CYCLES ||
      (soakDurationMs !== undefined && Date.now() < cycleDeadline)
    );
    const finalMetrics = await readMetrics();
    await appendFile(
      reportPath,
      `${JSON.stringify({
        kind: "finished",
        ok: true,
        cycles: cycle,
        baseline,
        finalMetrics,
      })}\n`,
    );
  } catch (error) {
    reportError = String(error);
    await appendFile(
      reportPath,
      `${JSON.stringify({ kind: "error", at: new Date().toISOString(), error: reportError })}\n`,
    );
    throw error;
  } finally {
    await stave.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    ).catch(() => {});
    await rm(projectPath, { recursive: true, force: true });
    if (reportError) {
      await appendFile(
        reportPath,
        `${JSON.stringify({ kind: "finished", ok: false, error: reportError })}\n`,
      );
    }
    await testInfo.attach("sustained-workbench-jsonl", {
      path: reportPath,
      contentType: "application/x-ndjson",
    });
  }
});
