import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

async function loadCard() {
  Object.defineProperty(globalThis, "window", {
    value: {
      api: {
        tooling: {
          getStatus: async () => ({
            checkedAt: 0,
            tools: [],
            workspace: {
              state: "synced",
              summary: "Up to date with origin/main.",
              detail: "Nothing to sync.",
              branch: "main",
              trackingBranch: "origin/main",
              originUrl: "git@example.com:acme/app.git",
              ahead: 0,
              behind: 0,
              dirty: false,
              dirtyFileCount: 0,
              canFastForwardOriginMain: false,
              baseBranch: "origin/main",
              recommendedCommand: null,
            },
          }),
        },
        shell: { openInTerminal: async () => ({ ok: true }) },
      },
    },
    configurable: true,
  });
  const mod = await import("@/components/layout/WorkspaceSyncStatusCard");
  return mod.WorkspaceSyncStatusCard;
}

describe("WorkspaceSyncStatusCard", () => {
  test("renders the workspace path it was given", async () => {
    const WorkspaceSyncStatusCard = await loadCard();
    const html = renderToStaticMarkup(
      createElement(WorkspaceSyncStatusCard, { cwd: "/tmp/acme-feature" }),
    );
    expect(html).toContain("/tmp/acme-feature");
  });

  test("renders fallback copy when cwd is null", async () => {
    const WorkspaceSyncStatusCard = await loadCard();
    const html = renderToStaticMarkup(
      createElement(WorkspaceSyncStatusCard, { cwd: null }),
    );
    expect(html).toContain("No active workspace path");
  });
});
