import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceProgressTaskTreeView } from "@/components/layout/WorkspaceProgressTaskTree";
import { workspaceProgressTaskTreeStyles } from "@/components/layout/workspace-progress-task-tree.styles";
import { sx } from "@/components/ads/utils/stylex";
import { applyProviderTurnActivityEvents } from "@/lib/providers/turn-status";
import { useAppStore } from "@/store/app.store";

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
    // A running task wears the shared working mark; the provider has its own icon.
    expect(html).toContain('data-state="working"');
    expect(html).toContain('data-motion="moving"');
    expect(html).toContain("claude-color.svg");
    expect(html).toContain("codex-color.svg");
    // One-depth list: no indent-guide border, only the parent-row inset.
    expect(html).toContain(sx(workspaceProgressTaskTreeStyles.list));
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

  describe("a running task's progress line", () => {
    // Server rendering reads the store's initial state, so the case writes there.
    const initial = useAppStore.getInitialState();
    const original = { ...initial };
    afterEach(() => Object.assign(initial, original));

    const render = (showProgress: boolean) => {
      const now = Date.now();
      const activity = applyProviderTurnActivityEvents({
        activityByTask: {},
        taskId: "task-running",
        turnId: "turn-1",
        providerId: "claude-code",
        events: [{ type: "tool", toolUseId: "read-1", toolName: "Read", input: JSON.stringify({ file_path: "src/a.ts" }), state: "input-available" }],
        now: now - 65_000,
      });
      Object.assign(initial, {
        activeWorkspaceId: "ws",
        activeTurnIdsByTask: { "task-running": "turn-1" },
        providerTurnActivityByTask: activity,
        messagesByTask: {},
      });
      return renderToStaticMarkup(
        createElement(WorkspaceProgressTaskTreeView, {
          items: [
            { taskId: "task-running", title: "Stream the workspace tree", status: "running", providerId: "claude-code" },
            { taskId: "task-idle", title: "Later cleanup", status: "idle", providerId: "codex" },
          ],
          workspaceId: "ws",
          showProgress,
          onOpenTask: () => {},
        }),
      );
    };

    test("sits on the running task's own row, with the time in a slot of its own", () => {
      const html = render(true);
      expect(html.match(/data-task-run-progress="working"/g)).toHaveLength(1);
      expect(html).toContain(">Read file<");
      // The time sits in its own span after the words. Its value follows the
      // shared clock, which does not tick under server rendering, so only its
      // one-unit form is fixed here.
      expect(html).toMatch(/>Read file<\/span><span[^>]*>\d+(?:s|m)<\/span>/);
      expect(html).toContain(sx(workspaceProgressTaskTreeStyles.progress));
    });

    test("stays off when the rows are compact", () => {
      expect(render(false)).not.toContain("data-task-run-progress");
    });
  });
});
