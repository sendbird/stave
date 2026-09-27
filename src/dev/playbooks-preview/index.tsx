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
import { ProposedMissionsPanel } from "@/components/layout/issues/ProposedMissionsPanel";
import type { ProposedMission } from "@/lib/missions/proposed";

const PREVIEW_NOW = new Date("2026-09-27T12:00:00.000Z");

function previewProposal(patch: Partial<ProposedMission> & Pick<ProposedMission, "id" | "source" | "title">): ProposedMission {
  return {
    sourceKey: patch.id,
    detail: null,
    url: null,
    playbookId: "playbook_preview_1",
    playbookName: "Request → PR",
    assignment: "Preview.",
    workspaceId: null,
    workspaceName: null,
    issue: null,
    proposedByMissionId: null,
    state: "pending",
    missionId: null,
    createdAt: "2026-09-27T11:40:00.000Z",
    updatedAt: "2026-09-27T11:40:00.000Z",
    ...patch,
  };
}

/** A spread of proposals across every source, for `&view=proposed`. */
const PREVIEW_PENDING: ProposedMission[] = [
  previewProposal({
    id: "p-pr",
    source: "pull-request",
    title: "Move billing to the new table · #612",
    detail: "Checks failed on PR #612",
    url: "https://github.com/acme/web/pull/612",
    playbookName: "Fix failing checks",
    workspaceId: "ws-web",
    workspaceName: "billing-table",
    createdAt: "2026-09-27T11:52:00.000Z",
  }),
  previewProposal({
    id: "p-issue",
    source: "issue",
    title: "WEB-418 · Export invoices as CSV",
    detail: "Assigned to you",
    url: "https://crane.example/WEB-418",
    issue: { source: "crane", key: "WEB-418" },
    createdAt: "2026-09-27T10:05:00.000Z",
  }),
  previewProposal({
    id: "p-triage",
    source: "triage",
    title: "Add a dark theme to the status page",
    detail: "Proposed by Triage requests",
    url: "https://slack.example/archives/C1/p1",
    createdAt: "2026-09-27T09:00:00.000Z",
  }),
];

const PREVIEW_RECENT: ProposedMission[] = [
  previewProposal({
    id: "r-schedule",
    source: "schedule",
    title: "Triage requests · Sat 09:00 AM",
    playbookName: "Triage requests",
    state: "started",
    missionId: "m1",
    updatedAt: "2026-09-26T09:00:00.000Z",
  }),
  previewProposal({ id: "r-dismissed", source: "issue", title: "WEB-401 · Rename the settings route", state: "dismissed", updatedAt: "2026-09-25T15:00:00.000Z" }),
];

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
            ...(index === 2
              ? { startsWhen: { pullRequest: { checksFailed: true, changesRequested: false }, autoStart: true } }
              : {}),
          })),
        },
      });
    }
    useAppStore.setState({
      activeWorkspaceId: "preview-workspace",
      workspaces: [{ id: "preview-workspace", name: "billing-table" }] as never,
    });
    setSeeded(true);
  }, []);
  const [view, setView] = useState(() => params.get("view") ?? "playbooks");
  return (
    <main className={sx(styles.page)}>
      <div className={sx(styles.bar)}>
        <strong>Automations · Playbooks</strong>
        <span>
          <ActionButton size="xs" onClick={() => setView((current) => (current === "proposed" ? "playbooks" : "proposed"))}>
            {view === "proposed" ? "Playbooks" : "Issues → Proposed"}
          </ActionButton>{" "}
          <ActionButton size="xs" onClick={openPreviewSheet}>
            Start mission sheet
          </ActionButton>{" "}
          <ActionButton size="xs" onClick={() => setDark((value) => !value)}>
            {dark ? "Light theme" : "Dark theme"}
          </ActionButton>
        </span>
      </div>
      <div className={sx(styles.frame)}>
        {!seeded ? null : view === "proposed" ? (
          <ProposedMissionsPanel
            pending={params.get("empty") === "1" ? [] : PREVIEW_PENDING}
            recent={params.get("empty") === "1" ? [] : PREVIEW_RECENT}
            loaded
            now={PREVIEW_NOW}
            startTarget={(proposal) =>
              proposal.source === "issue"
                ? { label: "Kick off", where: null, disabledReason: null }
                : { label: "Start", where: `in ${proposal.workspaceName ?? "billing-table"}`, disabledReason: null }
            }
            onStart={() => {}}
            onDismiss={() => {}}
            onOpenLink={() => {}}
            onOpenMission={() => {}}
            onOpenPlaybooks={() => setView("playbooks")}
          />
        ) : (
          <PlaybooksTab loadInsights={async (days) => previewInsights(days)} />
        )}
      </div>
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
