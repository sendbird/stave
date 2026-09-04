import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceProgressTaskTreeView } from "@/components/layout/WorkspaceProgressTaskTree";

describe("WorkspaceProgressTaskTreeView", () => {
  test("renders a one-depth tree of open tasks with provider marks and loaders", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceProgressTaskTreeView, {
        items: [
          {
            taskId: "task-running",
            title: "Stream the workspace tree",
            status: "running",
            providerId: "claude-code",
          },
          {
            taskId: "task-idle",
            title: "Later cleanup",
            status: "idle",
            providerId: "codex",
          },
        ],
        onOpenTask: () => {},
      }),
    );

    expect(html).toContain('data-testid="workspace-progress-tasks"');
    expect(html).toContain('aria-label="Open tasks"');
    expect(html).toContain('data-workspace-progress-task="task-running"');
    expect(html).toContain('data-workspace-progress-status="running"');
    expect(html).toContain("Stream the workspace tree");
    expect(html).toContain("Later cleanup");
    expect(html).toContain('data-loader-variant="pulse"');
    expect(html).toContain("claude-color.svg");
    expect(html).toContain("codex-color.svg");
    expect(html).toContain("border-l");
  });

  test("shows a pulse loader while the open-task list is still resolving", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceProgressTaskTreeView, {
        items: [],
        loading: true,
        onOpenTask: () => {},
      }),
    );

    expect(html).toContain('data-workspace-progress-loading="true"');
    expect(html).toContain("Loading tasks");
    expect(html).toContain('data-loader-variant="pulse"');
  });

  test("renders nothing when the workspace is idle", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceProgressTaskTreeView, {
        items: [],
        onOpenTask: () => {},
      }),
    );

    expect(html).toBe("");
  });
});
