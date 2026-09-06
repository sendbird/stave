import { appendFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  buildLargeTaskHistory,
  measureTaskHistoryBytes,
} from "../fixtures/large-task-history";
import { launchStave } from "./harness/stave-app";

const WORKSPACE_COUNT = 12;
const TASKS_PER_WORKSPACE = 8;
const SWITCHES_PER_WORKSPACE = 8;
const TRANSCRIPT_MESSAGES_PER_TASK = 16;
const LARGE_PART_BYTES = 64 * 1024;

type ResponsivenessMetrics = {
  sampledAt: number;
  mainRss: number;
  hostRss?: number;
  rendererHeapKB: number;
  processes: Array<{
    role: string;
    workingSetKB: number;
    cpuPercent: number;
  }>;
};

type Probe = {
  target: string;
  eventAt: number;
  twoFrameAt: number;
};

function taskIdFor(workspaceIndex: number, taskIndex: number) {
  return `responsiveness-ws-${workspaceIndex}-task-${taskIndex}`;
}

test("retained workspaces and tasks remain input-ready under bounded switching", async ({}, testInfo) => {
  test.setTimeout(180_000);
  const projectPath = await mkdtemp(
    path.join(tmpdir(), "stave-responsiveness-"),
  );
  const workspacePaths = Array.from({ length: WORKSPACE_COUNT }, (_, index) =>
    path.join(projectPath, `workspace-${index}`),
  );
  await Promise.all(
    workspacePaths.map((workspacePath) => mkdir(workspacePath)),
  );

  const reportPath = testInfo.outputPath("workbench-responsiveness.jsonl");
  await writeFile(reportPath, "");
  const historyBytesPerTask = measureTaskHistoryBytes(
    buildLargeTaskHistory({
      count: TRANSCRIPT_MESSAGES_PER_TASK,
      largePartEveryNth: 8,
      largePartBytes: LARGE_PART_BYTES,
      idPrefix: "responsiveness-size",
    }),
  );
  const fixtures = Array.from(
    { length: WORKSPACE_COUNT },
    (_, workspaceIndex) => {
      const tasks = Array.from(
        { length: TASKS_PER_WORKSPACE },
        (_, taskIndex) => {
          const taskId = taskIdFor(workspaceIndex, taskIndex);
          return {
            id: taskId,
            title: `Responsiveness ${workspaceIndex + 1}.${taskIndex + 1}`,
            provider: "claude-code" as const,
            updatedAt: `2026-09-05T00:${String(workspaceIndex).padStart(2, "0")}:00.000Z`,
            unread: false,
            controlMode: "interactive" as const,
            controlOwner: "stave" as const,
          };
        },
      );
      const messagesByTask = Object.fromEntries(
        tasks.map((task, taskIndex) => [
          task.id,
          buildLargeTaskHistory({
            count: TRANSCRIPT_MESSAGES_PER_TASK,
            largePartEveryNth: 8,
            largePartBytes: LARGE_PART_BYTES,
            idPrefix: `responsiveness-${workspaceIndex}-${taskIndex}`,
          }),
        ]),
      );
      const promptDraftByTask = Object.fromEntries(
        tasks.map((task) => [
          task.id,
          {
            text: `retained draft ${task.id}`,
            attachedFilePaths: [],
            attachments: [],
          },
        ]),
      );
      return {
        id: `responsiveness-ws-${workspaceIndex}`,
        name: `Responsiveness ${workspaceIndex + 1}`,
        tasks,
        messagesByTask,
        promptDraftByTask,
        openTaskTabIds: tasks.map((task) => task.id),
        activeTaskId: tasks[0]!.id,
      };
    },
  );

  const stave = await launchStave();
  let failed = false;
  try {
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

    const workspaceId = await stave.page.evaluate(async () => {
      const { rows } = await window.api.persistence!.listWorkspaces!();
      const id = rows[0]?.id;
      if (!id) throw new Error("native onboarding created no workspace");
      return id;
    });
    await expect
      .poll(
        async () =>
          stave.page.evaluate(async (id) => {
            const result = await window.api.persistence!.loadWorkspaceShell!({
              workspaceId: id,
            });
            return result.shell?.tasks.length ?? 0;
          }, workspaceId),
        { timeout: 15_000 },
      )
      .toBe(1);

    const seeded = await stave.page.evaluate(
      async ({ fixtures, workspaceId, projectPath }) => {
        const loaded = await window.api.persistence!.loadWorkspaceShell!({
          workspaceId,
        });
        if (!loaded.shell) throw new Error("base workspace shell unavailable");
        for (const fixture of fixtures) {
          const result = await window.api.persistence!.upsertWorkspace!({
            id: fixture.id,
            name: fixture.name,
            snapshot: {
              ...loaded.shell,
              activeTaskId: fixture.activeTaskId,
              tasks: fixture.tasks,
              messagesByTask: fixture.messagesByTask,
              promptDraftByTask: fixture.promptDraftByTask,
              providerSessionByTask: {},
              terminalTabs: [],
              cliSessionTabs: [],
              openTaskTabIds: fixture.openTaskTabIds,
              activeSurface: {
                kind: "task",
                taskId: fixture.activeTaskId,
              },
            },
          });
          if (!result.ok)
            throw new Error(`workspace seed failed: ${fixture.id}`);
        }

        const metadata = fixtures.map((fixture, index) => ({
          id: fixture.id,
          name: fixture.name,
          updatedAt: `2026-09-05T00:${String(index).padStart(2, "0")}:00.000Z`,
        }));
        const store = JSON.parse(
          window.localStorage.getItem("stave-store") ?? '{"state":{}}',
        ) as { state?: Record<string, unknown>; version?: number };
        const workspacePathById = Object.fromEntries(
          fixtures.map((fixture, index) => [
            fixture.id,
            index === 0 ? projectPath : `${projectPath}/workspace-${index}`,
          ]),
        );
        const workspaceBranchById = Object.fromEntries(
          fixtures.map((fixture) => [fixture.id, "main"]),
        );
        const workspaceDefaultById = Object.fromEntries(
          fixtures.map((fixture, index) => [fixture.id, index === 0]),
        );
        const projectEntry = {
          projectPath,
          projectName: "stave-responsiveness",
          lastOpenedAt: "2026-09-05T00:00:00.000Z",
          defaultBranch: "main",
          workspaces: metadata,
          activeWorkspaceId: fixtures[0]!.id,
          workspaceBranchById,
          workspacePathById,
          workspaceDefaultById,
        };
        store.state = {
          ...(store.state ?? {}),
          projectPath,
          projectName: "stave-responsiveness",
          defaultBranch: "main",
          recentProjects: [projectEntry],
          workspaces: metadata,
          activeWorkspaceId: fixtures[0]!.id,
          workspaceBranchById,
          workspacePathById,
          workspaceDefaultById,
        };
        window.localStorage.setItem("stave-store", JSON.stringify(store));
        const registryResult = await window.api.persistence!
          .saveProjectRegistry!({
          projects: [projectEntry],
          activeProjectPath: projectPath,
        });
        if (!registryResult.ok) throw new Error("project registry seed failed");
        window.localStorage.setItem(
          "stave:workspace-fallback:v1",
          JSON.stringify(
            fixtures.map((fixture, index) => ({
              id: fixture.id,
              name: fixture.name,
              updatedAt: `2026-09-05T00:${String(index).padStart(2, "0")}:00.000Z`,
              snapshot: {
                activeTaskId: fixture.activeTaskId,
                tasks: fixture.tasks,
                messagesByTask: fixture.messagesByTask,
                promptDraftByTask: fixture.promptDraftByTask,
                openTaskTabIds: fixture.openTaskTabIds,
              },
            })),
          ),
        );
        return { ok: true, workspaceCount: metadata.length };
      },
      { fixtures, workspaceId, projectPath },
    );
    expect(seeded).toEqual({ ok: true, workspaceCount: WORKSPACE_COUNT });
    await stave.page.reload({ waitUntil: "domcontentloaded" });

    const workspaceLabels = fixtures.map((fixture, index) =>
      index === 0 ? "Open workspace Default" : `Open workspace ${fixture.name}`,
    );
    for (const label of workspaceLabels) {
      await expect(stave.page.getByRole("button", { name: label })).toBeVisible(
        {
          timeout: 15_000,
        },
      );
    }

    await stave.page.evaluate(() => {
      type ProbeWindow = Window & { __responsivenessProbes?: Probe[] };
      const target = window as ProbeWindow;
      target.__responsivenessProbes = [];
      document.addEventListener(
        "click",
        (event) => {
          const element = event.target instanceof Element ? event.target : null;
          const workspace = element?.closest<HTMLElement>(
            '[aria-label^="Open workspace "]',
          );
          const task = element?.closest<HTMLElement>(
            '[data-pane-tab-chip^="task:"]',
          );
          const targetName =
            workspace?.getAttribute("aria-label") ?? task?.dataset.paneTabChip;
          if (!targetName) return;
          const eventAt = performance.now();
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              target.__responsivenessProbes?.push({
                target: targetName,
                eventAt,
                twoFrameAt: performance.now(),
              });
            }),
          );
        },
        true,
      );
    });

    const readMetrics = async (): Promise<ResponsivenessMetrics> =>
      stave.page.evaluate(async () => {
        const app = await window.api.metrics!.getAppMetrics!();
        const memory = await window.api.metrics!.getRendererMemory!();
        return {
          sampledAt: performance.now(),
          mainRss: app.mainProcess.rss,
          hostRss: app.hostService?.memory.rss,
          rendererHeapKB: memory.heap.usedHeapSize,
          processes: app.processes.map((process) => ({
            role: process.role,
            workingSetKB: process.memory.workingSetSizeKB,
            cpuPercent: process.cpu.percentCPUUsage,
          })),
        };
      });
    const baseline = await readMetrics();
    await appendFile(
      reportPath,
      `${JSON.stringify({
        kind: "run",
        startedAt: new Date().toISOString(),
        hardware: {
          platform: process.platform,
          arch: process.arch,
          cpuCount: os.cpus().length,
          totalMemoryBytes: os.totalmem(),
        },
        loadedData: {
          workspaces: WORKSPACE_COUNT,
          tasksPerWorkspace: TASKS_PER_WORKSPACE,
          messagesPerTask: TRANSCRIPT_MESSAGES_PER_TASK,
          historyBytesPerTask,
          totalHistoryBytes:
            historyBytesPerTask * WORKSPACE_COUNT * TASKS_PER_WORKSPACE,
          draftCount: WORKSPACE_COUNT * TASKS_PER_WORKSPACE,
        },
        providerTurns: 0,
        baseline,
      })}\n`,
    );

    const readProbe = async (targetName: string, priorCount: number) => {
      await expect
        .poll(
          async () =>
            stave.page.evaluate(
              ({ targetName, priorCount }) => {
                const probes =
                  (window as Window & { __responsivenessProbes?: Probe[] })
                    .__responsivenessProbes ?? [];
                return (
                  probes
                    .slice(priorCount)
                    .find((probe) => probe.target === targetName) ?? null
                );
              },
              { targetName, priorCount },
            ),
          { timeout: 5_000 },
        )
        .not.toBeNull();
      return stave.page.evaluate(
        ({ targetName, priorCount }) => {
          const probes =
            (window as Window & { __responsivenessProbes?: Probe[] })
              .__responsivenessProbes ?? [];
          return (
            probes
              .slice(priorCount)
              .find((probe) => probe.target === targetName) ?? null
          );
        },
        { targetName, priorCount },
      );
    };

    const samples: Array<Record<string, unknown>> = [];
    for (
      let workspaceIndex = 0;
      workspaceIndex < WORKSPACE_COUNT;
      workspaceIndex += 1
    ) {
      const fixture = fixtures[workspaceIndex]!;
      const workspaceLabel = workspaceLabels[workspaceIndex]!;
      const workspaceButton = stave.page.getByRole("button", {
        name: workspaceLabel,
      });
      const beforeWorkspaceProbeCount = await stave.page.evaluate(
        () =>
          (window as Window & { __responsivenessProbes?: Probe[] })
            .__responsivenessProbes?.length ?? 0,
      );
      await workspaceButton.click();
      await expect(
        stave.page.getByTestId(`conversation-scroll-${fixture.activeTaskId}`),
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        stave.page.locator('[data-prompt-lexical-editor="true"]'),
      ).toBeEditable();
      const workspaceProbe = await readProbe(
        workspaceLabel,
        beforeWorkspaceProbeCount,
      );
      const workspaceMetrics = await readMetrics();
      const workspaceSample = {
        kind: "workspace-switch",
        workspaceIndex,
        workspaceId: fixture.id,
        taskId: fixture.activeTaskId,
        inputToTwoFramesMs: workspaceProbe
          ? workspaceProbe.twoFrameAt - workspaceProbe.eventAt
          : null,
        inputToReadyMs: workspaceProbe
          ? workspaceMetrics.sampledAt - workspaceProbe.eventAt
          : null,
        metrics: workspaceMetrics,
      };
      samples.push(workspaceSample);
      await appendFile(reportPath, `${JSON.stringify(workspaceSample)}\n`);

      for (
        let switchIndex = 1;
        switchIndex <= SWITCHES_PER_WORKSPACE;
        switchIndex += 1
      ) {
        const taskIndex = switchIndex % TASKS_PER_WORKSPACE;
        const taskId = taskIdFor(workspaceIndex, taskIndex);
        const chip = stave.page.locator(
          `[data-pane-tab-chip="task:${taskId}"]`,
        );
        const beforeTaskProbeCount = await stave.page.evaluate(
          () =>
            (window as Window & { __responsivenessProbes?: Probe[] })
              .__responsivenessProbes?.length ?? 0,
        );
        await chip.click();
        await expect(
          stave.page.getByTestId(`conversation-scroll-${taskId}`),
        ).toBeVisible({ timeout: 15_000 });
        await expect(
          stave.page.locator('[data-prompt-lexical-editor="true"]'),
        ).toBeEditable();
        const taskProbe = await readProbe(
          `task:${taskId}`,
          beforeTaskProbeCount,
        );
        const taskMetrics = await readMetrics();
        const taskSample = {
          kind: "task-switch",
          workspaceIndex,
          taskIndex,
          workspaceId: fixture.id,
          taskId,
          inputToTwoFramesMs: taskProbe
            ? taskProbe.twoFrameAt - taskProbe.eventAt
            : null,
          inputToReadyMs: taskProbe
            ? taskMetrics.sampledAt - taskProbe.eventAt
            : null,
          metrics: taskMetrics,
        };
        samples.push(taskSample);
        await appendFile(reportPath, `${JSON.stringify(taskSample)}\n`);

        const retained = await stave.page.evaluate(
          async ({ workspaceId, taskId }) => {
            const shell = await window.api.persistence!.loadWorkspaceShell!({
              workspaceId,
            });
            const messages = await window.api.persistence!.loadTaskMessages!({
              workspaceId,
              taskId,
              limit: 2,
              offset: 0,
            });
            return {
              draft: shell.shell?.promptDraftByTask?.[taskId]?.text ?? null,
              messageCount: messages.page?.totalCount ?? 0,
            };
          },
          { workspaceId: fixture.id, taskId },
        );
        expect(retained.draft).toBe(`retained draft ${taskId}`);
        expect(retained.messageCount).toBe(TRANSCRIPT_MESSAGES_PER_TASK);
      }
    }

    expect(samples).toHaveLength(
      WORKSPACE_COUNT * (1 + SWITCHES_PER_WORKSPACE),
    );
    await appendFile(
      reportPath,
      `${JSON.stringify({ kind: "finished", ok: true, sampleCount: samples.length, baseline, final: await readMetrics() })}\n`,
    );
  } catch (error) {
    failed = true;
    await appendFile(
      reportPath,
      `${JSON.stringify({ kind: "error", error: String(error) })}\n`,
    );
    throw error;
  } finally {
    await stave.close();
    await rm(projectPath, { recursive: true, force: true });
    if (failed)
      await appendFile(
        reportPath,
        `${JSON.stringify({ kind: "finished", ok: false })}\n`,
      );
    await testInfo.attach("workbench-responsiveness-jsonl", {
      path: reportPath,
      contentType: "application/x-ndjson",
    });
  }
});
