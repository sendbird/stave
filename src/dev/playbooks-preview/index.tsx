import { useLayoutEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { ActionButton } from "@/components/system/ActionButton";
import { PlaybooksTab } from "@/components/playbooks/PlaybooksTab";
import { createPlaybookFromStarter, PLAYBOOK_STARTERS } from "@/lib/playbooks/starters";
import { applyThemeClass } from "@/lib/themes/apply";
import { useAppStore } from "@/store/app.store";
import { StartMissionSheetHost } from "@/components/missions/StartMissionSheet";
import { aggregateMissionInsights } from "@/lib/missions/insights";
import { usePlaybooksUiStore } from "@/store/playbooks-ui-store";

/** Stand-ins for the desktop bridge calls the Start sheet makes. */
function installPreviewBridge() {
  const api = ((window as unknown as { api?: Record<string, unknown> }).api ??= {});
  api.localMcp = {
    ...(api.localMcp as object),
    getStatus: async () => ({
      ok: true,
      status: { config: { enabled: true }, running: true, manifest: {} },
    }),
  };
  api.sourceControl = {
    ...(api.sourceControl as object),
    getStatus: async () => ({ ok: true, branch: "fix/billing", items: [{ code: "M", path: "a.ts" }, { code: "M", path: "b.ts" }], hasConflicts: false, stderr: "" }),
    getPrStatus: async () => ({ ok: false, pr: null, stderr: "no pull requests found for branch" }),
  };
}

function openPreviewSheet() {
  installPreviewBridge();
  useAppStore.setState((state) => ({
    tasks: [
      ...state.tasks.filter((task) => task.id !== "preview-task"),
      { id: "preview-task", title: "Fix billing table overflow", provider: "claude-code" } as never,
    ],
    workspacePathById: { ...state.workspacePathById, "preview-workspace": "/tmp/preview" },
  }));
  usePlaybooksUiStore.getState().openStartSheet({
    workspaceId: "preview-workspace",
    taskId: "preview-task",
    assignment: "Fix the billing table overflow on narrow screens.",
  });
}

/*
 * Dev-only preview of the Playbooks tab: `?stavePreview=playbooks`. Add
 * `&empty=1` for the first-run state.
 */
const params = new URLSearchParams(window.location.search);

/** Mission insights from a spread of ended missions, for the preview. */
function previewInsights(days: number) {
  const metrics = (replies: number, nudges: number, stuck: number, waitMinutes: number | null) => ({
    providerId: "claude-code",
    userReplies: replies,
    nudges,
    stuckStages: stuck,
    signOffs: waitMinutes === null ? 0 : 2,
    signOffWaitAverageMs: waitMinutes === null ? null : waitMinutes * 60_000,
    signOffWaitLongestMs: waitMinutes === null ? null : waitMinutes * 90_000,
  });
  const usage = (cost: number | null) => ({ turns: 8, measuredTurns: 8, inputTokens: 200_000, outputTokens: 20_000, costUsd: cost });
  const samples = [
    ...Array.from({ length: 9 }, (_, index) => ({ playbookName: "Request → PR", providerId: "claude-code", state: index < 8 ? "completed" : "stopped", metrics: metrics(1, 0, 0, 6), usage: usage(1.1) })),
    ...Array.from({ length: 5 }, (_, index) => ({ playbookName: "Request → PR", providerId: "codex", state: index < 4 ? "completed" : "cancelled", metrics: metrics(2, 1, index === 0 ? 1 : 0, 9), usage: usage(null) })),
    ...Array.from({ length: 4 }, () => ({ playbookName: "Fix failing checks", providerId: "codex", state: "completed", metrics: metrics(0, 0, 0, null), usage: usage(null) })),
    ...Array.from({ length: 3 }, () => ({ playbookName: "Slack request → PR", providerId: "claude-code", state: "completed", metrics: metrics(1, 0, 0, 14), usage: usage(2.4) })),
  ] as Parameters<typeof aggregateMissionInsights>[0];
  // Shorter periods keep every other mission, so each provider still shows.
  return aggregateMissionInsights(days >= 30 ? samples : samples.filter((_, index) => index % 3 === 0), days);
}

export function PlaybooksPreview() {
  const [dark, setDark] = useState(() => params.get("theme") === "dark");
  const [seeded, setSeeded] = useState(false);
  useLayoutEffect(() => {
    applyThemeClass({ enabled: dark });
  }, [dark]);
  useLayoutEffect(() => {
    if (params.get("empty") === "1") {
      useAppStore.getState().updateSettings({ patch: { playbooks: [] } });
    } else {
      const now = new Date("2026-09-26T09:00:00.000Z");
      useAppStore.getState().updateSettings({
        patch: {
          playbooks: PLAYBOOK_STARTERS.slice(0, 3).map((starter, index) => ({
            ...createPlaybookFromStarter(starter, { now, id: `playbook_preview_${index}` }),
            ...(index === 1 ? { shortcut: "pr" } : {}),
          })),
        },
      });
    }
    setSeeded(true);
  }, []);
  return (
    <main className={sx(styles.page)}>
      <div className={sx(styles.bar)}>
        <strong>Automations · Playbooks</strong>
        <span>
          <ActionButton size="xs" onClick={openPreviewSheet}>
            Start mission sheet
          </ActionButton>{" "}
          <ActionButton size="xs" onClick={() => setDark((value) => !value)}>
            {dark ? "Light theme" : "Dark theme"}
          </ActionButton>
        </span>
      </div>
      <div className={sx(styles.frame)}>{seeded ? <PlaybooksTab loadInsights={async (days) => previewInsights(days)} /> : null}</div>
      <StartMissionSheetHost />
    </main>
  );
}

const styles = stylex.create({
  page: {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    backgroundColor: vars["--ads-color-canvas"],
    color: vars["--ads-color-text"],
  },
  bar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingInline: vars["--ads-space-16"],
    paddingBlock: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-body"],
  },
  frame: { flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column" },
});
