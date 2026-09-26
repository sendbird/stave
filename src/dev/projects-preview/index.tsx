import { useLayoutEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { ActionButton } from "@/components/system/ActionButton";
import { ProjectsView } from "@/components/projects/ProjectsView";
import { SidebarPrimaryNav } from "@/components/layout/SidebarPrimaryNav";
import type { ProjectDetail, ProjectMissionView } from "@/lib/projects/api";
import { DEFAULT_PROJECT_SETTINGS, type MissionProposal, type Project } from "@/lib/projects/domain";
import { createPlaybookFromStarter, findPlaybookStarter } from "@/lib/playbooks/starters";
import { applyThemeClass } from "@/lib/themes/apply";
import { useProjectsStore } from "@/store/projects-store";

/*
 * Dev-only preview of the Projects surface: `?stavePreview=projects`. Add
 * `&empty=1` for the first-run state.
 */
const params = new URLSearchParams(window.location.search);
const now = Date.now();
const iso = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
const playbook = createPlaybookFromStarter(findPlaybookStarter("request-to-pr")!, { now: new Date(), id: "pb" });

const project: Project = {
  id: "project-preview",
  name: "Dashboard design-system move",
  goal: "Every dashboard screen uses the new components; no legacy imports remain.",
  repositoryPath: "/tmp/acme",
  coordinator: { workspaceId: "ws", taskId: "coord" },
  settings: { ...DEFAULT_PROJECT_SETTINGS, parallelLimit: 3 },
  state: "active",
  summary: "Started Billing table and Settings form in parallel; Navigation waits on the shared header change (#618).",
  reasonDetail: null,
  createdAt: iso(300),
  updatedAt: iso(5),
};

function mission(patch: Partial<ProjectMissionView>): ProjectMissionView {
  return {
    missionId: "m",
    workspaceId: "ws-m",
    taskId: "t",
    playbookName: "Request → PR",
    assignment: "Move the billing table to the new Table component.",
    state: "running",
    currentStageIndex: 2,
    stageCount: 6,
    stageTitle: "Verify",
    currentStageStatus: "running",
    providerId: "claude-code",
    updatedAt: iso(3),
    report: null,
    usage: { turns: 6, measuredTurns: 6, inputTokens: 180_000, outputTokens: 22_000, costUsd: patch.providerId === "codex" ? null : 1.12 },
    ...patch,
  };
}

const proposal: MissionProposal = {
  id: "proposal",
  projectId: project.id,
  startKey: "nav",
  playbook,
  assignment: "Move the navigation bar once the shared header lands.",
  providerId: "codex",
  model: null,
  worktreeName: "navigation",
  state: "pending",
  workspaceId: null,
  taskId: null,
  missionId: null,
  detail: null,
  createdAt: iso(10),
  updatedAt: iso(10),
};

const detail: ProjectDetail = {
  project,
  proposals: [proposal],
  missions: [
    mission({ missionId: "m1", assignment: "Move the settings form to the new Form fields.", currentStageIndex: 5, stageTitle: "Ready for review", currentStageStatus: "awaiting-sign-off", providerId: "codex" }),
    mission({ missionId: "m2" }),
    mission({ missionId: "m3", assignment: "Move the shared header.", currentStageIndex: 1, stageTitle: "Build", providerId: "codex" }),
    mission({
      missionId: "m4",
      assignment: "Replace design tokens with the new scale.",
      state: "completed",
      currentStageIndex: 5,
      report: { links: [{ label: "PR #605", url: "https://github.com/acme/app/pull/605", source: "stave" }] } as never,
    }),
    mission({ missionId: "m5", assignment: "Move buttons.", state: "completed", currentStageIndex: 5 }),
  ],
  memories: [
    { id: "a", projectId: project.id, kind: "decision", content: "Use the shared Table component — it handles overflow and sticky headers.", status: "accepted", sourceMissionId: "m4", createdAt: iso(60) },
    { id: "b", projectId: project.id, kind: "decision", content: "Keep form validation messages under the field — matches the new Form spec.", status: "candidate", sourceMissionId: "m5", createdAt: iso(40) },
  ],
  library: [
    { label: "PR #605", url: "https://github.com/acme/app/pull/605", kind: "pull-request", missionId: "m4", missionTitle: "Replace design tokens with the new scale.", verified: true },
    { label: "Preview", url: "https://acme-git-tokens.vercel.app", kind: "preview", missionId: "m4", missionTitle: "Replace design tokens with the new scale.", verified: false },
  ],
  events: [{ id: "e", projectId: project.id, sequence: 1, kind: "coordinator-woken", idempotencyKey: null, detail: {}, createdAt: iso(5) }],
};

export function ProjectsPreview() {
  const [dark, setDark] = useState(() => params.get("theme") === "dark");
  useLayoutEffect(() => {
    applyThemeClass({ enabled: dark });
  }, [dark]);
  useLayoutEffect(() => {
    const empty = params.get("empty") === "1";
    useProjectsStore.setState({
      loaded: true,
      projects: empty ? [] : [project, { ...project, id: "p2", name: "Checkout reliability", state: "paused" }],
      details: empty ? {} : { [project.id]: detail },
      selectedId: empty ? null : project.id,
    });
  }, []);
  return (
    <main className={sx(styles.page)}>
      <aside className={sx(styles.sidebar)}>
        <SidebarPrimaryNav showFleetView />
        <ActionButton size="xs" onClick={() => setDark((value) => !value)}>
          {dark ? "Light theme" : "Dark theme"}
        </ActionButton>
      </aside>
      <div className={sx(styles.surface)}>
        <ProjectsView />
      </div>
    </main>
  );
}

const styles = stylex.create({
  page: { height: "100vh", display: "flex", backgroundColor: vars["--ads-color-canvas"], color: vars["--ads-color-text"] },
  sidebar: {
    width: 240,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: vars["--ads-space-8"],
    borderInlineEndWidth: 1,
    borderInlineEndStyle: "solid",
    borderInlineEndColor: vars["--ads-color-border-subtle"],
  },
  surface: { flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column" },
});
