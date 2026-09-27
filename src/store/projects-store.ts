/**
 * Renderer state for projects: every project, the detail of the open ones,
 * and which one the Projects view shows. The host is the source of truth;
 * every command returns the project as it is afterwards, and
 * `projects:changed` refreshes the rest.
 */
import { useEffect } from "react";
import { create } from "zustand";
import type { ProjectDetail, ProjectResponse, ProjectsBridgeApi } from "@/lib/projects/api";
import { isOpenProjectState, type Project, type ProjectCreateInput } from "@/lib/projects/domain";

export type ProjectDetailTab = "memory" | "library" | "starts-when" | "settings";

type CommandName =
  | "approveProposal"
  | "rejectProposal"
  | "pause"
  | "resume"
  | "end"
  | "updateSettings"
  | "setMemoryStatus"
  | "messageCoordinator";

interface ProjectsState {
  projects: Project[];
  details: Record<string, ProjectDetail>;
  selectedId: string | null;
  /** The command palette asked for the New project dialog. */
  newProjectRequested: boolean;
  /** The tab the project home shows below its lanes. */
  detailTab: ProjectDetailTab;
  /** The coordinator conversation beside the project, where the window has room for it. */
  dockOpen: boolean;
  /** The conversation floating over the project on a narrow window. */
  dockOverlayOpen: boolean;
  loaded: boolean;
  pendingById: Record<string, boolean>;
  failureById: Record<string, string | null>;
  load: () => Promise<void>;
  refresh: (projectId: string) => Promise<void>;
  select: (projectId: string | null) => void;
  requestNewProject: (requested: boolean) => void;
  setDetailTab: (tab: ProjectDetailTab) => void;
  /** Shows the coordinator conversation: docked where it fits, floating otherwise. */
  openCoordinatorDock: () => void;
  closeCoordinatorDock: (mode: "docked" | "overlay") => void;
  create: (input: ProjectCreateInput) => Promise<ProjectResponse>;
  runCommand: <A extends CommandName>(command: A, args: Parameters<ProjectsBridgeApi[A]>[0]) => Promise<ProjectResponse>;
}

function projectsApi(): ProjectsBridgeApi | null {
  return typeof window === "undefined" ? null : (window.api?.projects ?? null);
}

export const useProjectsStore = create<ProjectsState>()((set, get) => {
  function storeDetail(detail: ProjectDetail) {
    set((state) => ({
      details: { ...state.details, [detail.project.id]: detail },
      projects: state.projects.some((project) => project.id === detail.project.id)
        ? state.projects.map((project) => (project.id === detail.project.id ? detail.project : project))
        : [detail.project, ...state.projects],
    }));
  }

  return {
    projects: [],
    details: {},
    selectedId: null,
    newProjectRequested: false,
    detailTab: "memory",
    dockOpen: true,
    dockOverlayOpen: false,
    loaded: false,
    pendingById: {},
    failureById: {},

    load: async () => {
      const api = projectsApi();
      if (!api) {
        set({ loaded: true });
        return;
      }
      const listed = await api.list({}).catch(() => null);
      if (!listed?.ok) {
        set({ loaded: true });
        return;
      }
      set({ projects: listed.projects, loaded: true });
      await Promise.all(
        listed.projects.filter((project) => isOpenProjectState(project.state)).map((project) => get().refresh(project.id)),
      );
    },

    refresh: async (projectId) => {
      const response = await projectsApi()?.get({ projectId }).catch(() => null);
      if (response?.ok && response.project) storeDetail(response.project);
    },

    select: (projectId) => {
      set({ selectedId: projectId });
      if (projectId && !get().details[projectId]) void get().refresh(projectId);
    },

    requestNewProject: (requested) => set({ newProjectRequested: requested }),
    setDetailTab: (tab) => set({ detailTab: tab }),
    openCoordinatorDock: () => set({ dockOpen: true, dockOverlayOpen: true }),
    closeCoordinatorDock: (mode) => set(mode === "docked" ? { dockOpen: false } : { dockOverlayOpen: false }),

    create: async (input) => {
      const api = projectsApi();
      if (!api) return { ok: false, project: null, code: "failed", message: "Projects need the desktop app." };
      const response = await api.create(input).catch(
        (error: unknown): ProjectResponse => ({
          ok: false,
          project: null,
          code: "failed",
          message: error instanceof Error ? error.message : "The project could not be created.",
        }),
      );
      if (response.ok && response.project) {
        storeDetail(response.project);
        set({ selectedId: response.project.project.id });
      }
      return response;
    },

    runCommand: async (command, args) => {
      const api = projectsApi();
      const projectId = (args as { projectId: string }).projectId;
      if (!api) return { ok: false, project: null, code: "failed", message: "Projects need the desktop app." };
      set((state) => ({
        pendingById: { ...state.pendingById, [projectId]: true },
        failureById: { ...state.failureById, [projectId]: null },
      }));
      const call = api[command] as (value: typeof args) => Promise<ProjectResponse>;
      const response = await call(args).catch(
        (error: unknown): ProjectResponse => ({
          ok: false,
          project: null,
          code: "failed",
          message: error instanceof Error ? error.message : "The project request failed.",
        }),
      );
      set((state) => ({ pendingById: { ...state.pendingById, [projectId]: false } }));
      if (response.ok && response.project) storeDetail(response.project);
      else {
        set((state) => ({ failureById: { ...state.failureById, [projectId]: response.message ?? "The project request failed." } }));
        if (response.code === "stale") void get().refresh(projectId);
      }
      return response;
    },
  };
});

/** What waits for the user in a project: proposals and missions that stopped for them. */
export function countProjectNeeds(detail: ProjectDetail | undefined): number {
  if (!detail) return 0;
  const proposals = detail.proposals.filter((proposal) => proposal.state === "pending").length;
  const missions = detail.missions.filter(
    (mission) =>
      mission.state === "running" &&
      (mission.currentStageStatus === "awaiting-sign-off" ||
        mission.currentStageStatus === "blocked" ||
        mission.currentStageStatus === "stuck"),
  ).length;
  return proposals + missions;
}

/** Mounted once in `App.tsx`: loads projects and follows `projects:changed`. */
export function useProjectsSync() {
  useEffect(() => {
    const api = projectsApi();
    const { load, refresh } = useProjectsStore.getState();
    void load();
    if (!api) return;
    return api.subscribeChanged((event) => void refresh(event.projectId));
  }, []);
}
