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
  | "linkTask"
  | "unlinkTask"
  | "recordIntegration"
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
  /** The tab the project home shows below its lanes. */
  detailTab: ProjectDetailTab;
  /** The coordinator conversation beside the project, where the window has room for it. */
  dockOpen: boolean;
  /** The conversation floating over the project on a narrow window. */
  dockOverlayOpen: boolean;
  loaded: boolean;
  /** The project list is being read. */
  loading: boolean;
  /** Why the project list could not be read; the view offers a retry instead of the empty state. */
  loadFailure: string | null;
  pendingById: Record<string, boolean>;
  failureById: Record<string, string | null>;
  /** Why a project's detail could not be read, until a read succeeds. */
  detailFailureById: Record<string, string | null>;
  load: () => Promise<void>;
  refresh: (projectId: string) => Promise<void>;
  select: (projectId: string | null) => void;
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
    detailTab: "memory",
    dockOpen: true,
    dockOverlayOpen: false,
    loaded: false,
    loading: false,
    loadFailure: null,
    pendingById: {},
    failureById: {},
    detailFailureById: {},

    load: async () => {
      const api = projectsApi();
      if (!api) {
        set({ loaded: true, loadFailure: null });
        return;
      }
      set({ loading: true });
      const listed = await api
        .list({})
        .catch((error: unknown) => ({
          ok: false as const,
          projects: [],
          message: error instanceof Error ? error.message : undefined,
        }));
      if (!listed.ok) {
        set({ loaded: true, loading: false, loadFailure: listed.message || "Projects could not be loaded." });
        return;
      }
      set({ projects: listed.projects, loaded: true, loading: false, loadFailure: null });
      await Promise.all(
        listed.projects.filter((project) => isOpenProjectState(project.state)).map((project) => get().refresh(project.id)),
      );
    },

    refresh: async (projectId) => {
      const api = projectsApi();
      if (!api) return;
      const response = await api.get({ projectId }).catch(
        (error: unknown): ProjectResponse => ({
          ok: false,
          project: null,
          code: "failed",
          message: error instanceof Error ? error.message : undefined,
        }),
      );
      if (response.ok && response.project) {
        storeDetail(response.project);
        if (get().detailFailureById[projectId]) {
          set((state) => ({ detailFailureById: { ...state.detailFailureById, [projectId]: null } }));
        }
        return;
      }
      set((state) => ({
        detailFailureById: {
          ...state.detailFailureById,
          [projectId]: response.message || "This project could not be loaded.",
        },
      }));
    },

    select: (projectId) => {
      set({ selectedId: projectId });
      if (projectId && !get().details[projectId]) void get().refresh(projectId);
    },

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
      const response = await Promise.resolve().then(() => {
        if (typeof call !== "function") throw new Error("Restart Stave to use the updated project coordination controls.");
        return call(args);
      }).catch(
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

/** What waits for the user across every open project, whether or not the sidebar lists it. */
export function countAllProjectNeeds(projects: readonly Project[], details: Record<string, ProjectDetail>): number {
  return projects
    .filter((project) => isOpenProjectState(project.state))
    .reduce((sum, project) => sum + countProjectNeeds(details[project.id]), 0);
}

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
