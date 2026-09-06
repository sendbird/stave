import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave } from "./harness/stave-app";

const CAPACITY_REASON = "Selected model is at capacity. (status: 503)";
const CAPACITY_GUIDANCE =
  "Retry later, or choose another model before resuming.";

test("persisted Codex capacity failure stays visible and offers manual recovery after reload", async ({}, testInfo) => {
  const projectPath = await mkdtemp(path.join(tmpdir(), "stave-capacity-"));
  const stave = await launchStave();
  const rendererErrors: string[] = [];
  stave.page.on("pageerror", (error) => rendererErrors.push(error.message));

  try {
    await stave.page.setViewportSize({ width: 900, height: 720 });
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
      return rows[0]!.id;
    });
    await expect
      .poll(async () =>
        stave.page.evaluate(async (id) => {
          const { shell } = await window.api.persistence!.loadWorkspaceShell!({
            workspaceId: id,
          });
          return shell?.tasks.length ?? 0;
        }, workspaceId),
      )
      .toBe(1);

    const saved = await stave.page.evaluate(
      async ({ guidance, reason, workspaceId }) => {
        const { shell } = await window.api.persistence!.loadWorkspaceShell!({
          workspaceId,
        });
        const taskId = shell?.activeTaskId ?? shell?.tasks[0]?.id;
        if (!shell || !taskId) {
          throw new Error("Capacity fixture task was not persisted");
        }
        const result = await window.api.persistence!.upsertWorkspace!({
          id: workspaceId,
          name: "Capacity fixture",
          snapshot: {
            ...shell,
            activeTaskId: taskId,
            tasks: shell.tasks.map((task) =>
              task.id === taskId ? { ...task, provider: "codex" } : task,
            ),
            messagesByTask: {
              [taskId]: [
                {
                  id: "capacity-failure-message",
                  role: "assistant",
                  model: "gpt-5.6",
                  providerId: "codex",
                  turnId: "capacity-failure-turn",
                  content: "",
                  startedAt: "2026-09-05T15:45:40.000Z",
                  completedAt: "2026-09-05T15:45:49.000Z",
                  isStreaming: false,
                  terminalStopReason: "failed",
                  parts: [
                    {
                      type: "system_event",
                      content: `[error] ${reason}\n${guidance}`,
                    },
                  ],
                },
              ],
            },
          },
        });
        return { ok: result.ok, taskId, workspaceId };
      },
      {
        guidance: CAPACITY_GUIDANCE,
        reason: CAPACITY_REASON,
        workspaceId,
      },
    );
    expect(saved.ok).toBe(true);

    await stave.page.reload({ waitUntil: "domcontentloaded" });

    const recovery = stave.page.locator('[data-provider-error="capacity"]');
    const failureHeading = stave.page.getByText("Run failed", { exact: true });
    await expect(stave.page.locator("html")).toHaveClass(/dark/);
    await expect(failureHeading).toBeVisible();
    await expect(recovery).toBeAttached();
    await expect(stave.page.getByText(CAPACITY_REASON, { exact: true })).toBeVisible();
    await expect(recovery.getByText(CAPACITY_GUIDANCE, { exact: true })).toBeVisible();
    await expect(
      recovery.getByRole("button", { name: "Resume work", exact: true }),
    ).toBeEnabled();
    await failureHeading.scrollIntoViewIfNeeded();
    await stave.page.screenshot({
      path: testInfo.outputPath("codex-capacity-recovery-dark.png"),
    });

    await stave.page.evaluate(() => {
      document.documentElement.classList.remove("dark");
    });
    await expect(stave.page.locator("html")).not.toHaveClass(/dark/);
    await expect(recovery).toBeVisible();
    await stave.page.screenshot({
      path: testInfo.outputPath("codex-capacity-recovery-narrow-light.png"),
    });
    expect(rendererErrors).toEqual([]);
  } finally {
    await stave.close();
    await rm(projectPath, { recursive: true, force: true });
  }
});
