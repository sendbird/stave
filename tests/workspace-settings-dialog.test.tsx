import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

async function loadDialog() {
  Object.defineProperty(globalThis, "window", {
    value: {
      api: {
        tooling: {
          getStatus: async () => ({ checkedAt: 0, tools: [], workspace: null }),
        },
        shell: { openInTerminal: async () => ({ ok: true }) },
        scripts: { getConfig: async () => ({ ok: true, config: null }) },
      },
    },
    configurable: true,
  });
  const mod = await import("@/components/layout/WorkspaceSettingsDialog");
  return mod.WorkspaceSettingsDialog;
}

describe("WorkspaceSettingsDialog", () => {
  test("renders the workspace name and tab labels when open", async () => {
    const WorkspaceSettingsDialog = await loadDialog();
    const html = renderToStaticMarkup(
      createElement(WorkspaceSettingsDialog, {
        open: true,
        onOpenChange: () => {},
        workspaceId: "ws-1",
        workspaceName: "feature-login",
        branch: "feature/login",
        projectPath: "/tmp/acme",
        workspacePath: "/tmp/acme-feature",
      }),
    );
    expect(html).toContain("feature-login");
    expect(html).toContain("Sync");
    expect(html).toContain("Workspace Tools");
  });
});
