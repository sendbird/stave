import { expect, test } from "@playwright/test";

test("model shortcuts do not type their digit into the prompt", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const workspace = {
      id: "ws-main",
      name: "main",
      updatedAt: "2026-08-10T00:00:00.000Z",
    };
    const task = {
      id: "task-1",
      title: "Shortcut input regression",
      provider: "claude-code",
      updatedAt: "2026-08-10T00:00:00.000Z",
      unread: false,
      archivedAt: null,
    };

    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          ...workspace,
          snapshot: {
            activeTaskId: task.id,
            openTaskTabIds: [task.id],
            activeSurface: { kind: "task", taskId: task.id },
            tasks: [task],
            messagesByTask: { [task.id]: [] },
          },
        },
      ]),
    );
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          projectPath: "/tmp/stave-project",
          projectName: "stave-project",
          workspaces: [workspace],
          activeWorkspaceId: workspace.id,
          workspaceBranchById: { [workspace.id]: "main" },
          workspacePathById: { [workspace.id]: "/tmp/stave-project" },
          workspaceDefaultById: { [workspace.id]: true },
          activeTaskId: task.id,
          tasks: [task],
          messagesByTask: { [task.id]: [] },
        },
        version: 0,
      }),
    );
  });

  await page.goto("/");

  const prompt = page.getByRole("textbox", { name: "Prompt" });
  await prompt.fill("keep this text");
  await prompt.evaluate((element) => {
    element.addEventListener("keydown", (event) => {
      if (event.altKey && event.code === "Digit2" && !event.defaultPrevented) {
        // macOS Option-composed input can reach the editor before a bubbling
        // window listener. Model that editor-side insertion at the same seam.
        document.execCommand("insertText", false, "2");
      }
    });
  });
  await prompt.dispatchEvent("keydown", {
    key: "™",
    code: "Digit2",
    altKey: true,
    bubbles: true,
    cancelable: true,
  });

  await expect(
    page.getByRole("button", { name: /^Model and effort: GPT-5\.6 Terra/ }),
  ).toBeVisible();
  await expect(prompt).toHaveText("keep this text");
});
