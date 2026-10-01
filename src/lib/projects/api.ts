/**
 * The renderer ↔ host contract for projects: `window.api.projects`.
 */
import type { LinkProjectTaskArgs, RecordProjectIntegrationArgs, ProjectTaskView, ProjectTaskCandidate } from "./task-integration";
import type { MissionUsage } from "@/lib/missions/usage";
import type { MissionReport } from "@/lib/missions/report";
import type { MissionState, StageStatus } from "@/lib/missions/domain";
import type { Playbook } from "@/lib/playbooks/schema";
import type {
  MissionProposal,
  MissionProviderId,
  Project,
  ProjectCreateInput,
  ProjectEvent,
  ProjectMemory,
  ProjectSettings,
} from "./domain";

export const PROJECT_IPC = Object.freeze({
  list: "projects:list",
  linkTask: "projects:link-task",
  unlinkTask: "projects:unlink-task",
  recordIntegration: "projects:record-integration",
  get: "projects:get",
  create: "projects:create",
  approveProposal: "projects:approve-proposal",
  messageCoordinator: "projects:message-coordinator",
  rejectProposal: "projects:reject-proposal",
  pause: "projects:pause",
  resume: "projects:resume",
  end: "projects:end",
  updateSettings: "projects:update-settings",
  setMemoryStatus: "projects:set-memory-status",
  syncPlaybooks: "projects:sync-playbooks",
  /** Main → renderer: a `ProjectChangedEvent`. */
  changed: "projects:changed",
});

/** One mission of a project, as the project home lists it. */
export interface ProjectMissionView {
  missionId: string;
  workspaceId: string;
  taskId: string;
  playbookName: string;
  assignment: string;
  state: MissionState;
  currentStageIndex: number;
  stageCount: number;
  stageTitle: string | null;
  currentStageStatus: StageStatus;
  providerId: string;
  updatedAt: string;
  report: MissionReport | null;
  /** What the mission's turns spent so far; null when unknown. */
  usage?: MissionUsage | null;
}

/** A link the project collected, from a mission's report. */
export interface ProjectLibraryItem {
  label: string;
  url: string;
  kind: "pull-request" | "issue" | "preview" | "document" | "link";
  missionId: string;
  missionTitle: string;
  verified: boolean;
}

export interface ProjectDetail {
  project: Project;
  proposals: MissionProposal[];
  missions: ProjectMissionView[];
  memories: ProjectMemory[];
  library: ProjectLibraryItem[];
  /** The newest events, oldest first. */
  events: ProjectEvent[];
  /** The coordinator task as it is now: whether it can take a message and is answering. */
  coordinatorState?: ProjectCoordinatorState;
  linkedTasks?: ProjectTaskView[];
  taskCandidates?: ProjectTaskCandidate[];
  integrationSnapshot?: string;
  integrationStatus?: "not-recorded" | "pending" | "accepted" | "stale";
}

export interface ProjectCoordinatorState {
  available: boolean;
  busy: boolean;
  providerId: string | null;
  model: string | null;
}

export interface ProjectChangedEvent {
  projectId: string;
  state: Project["state"];
  updatedAt: string;
}

export type ProjectFailureCode = "not-found" | "refused" | "stale" | "invalid-args" | "failed";

export type ProjectInvokeResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: ProjectFailureCode; message: string };

export interface ProjectResponse {
  ok: boolean;
  project: ProjectDetail | null;
  code?: ProjectFailureCode;
  message?: string;
}

export interface ProjectsBridgeApi {
  list: (args?: { openOnly?: boolean }) => Promise<{ ok: boolean; projects: Project[]; message?: string }>;
  linkTask: (args: LinkProjectTaskArgs) => Promise<ProjectResponse>;
  unlinkTask: (args: { projectId: string; taskId: string }) => Promise<ProjectResponse>;
  recordIntegration: (args: RecordProjectIntegrationArgs) => Promise<ProjectResponse>;
  get: (args: { projectId: string }) => Promise<ProjectResponse>;
  create: (args: ProjectCreateInput) => Promise<ProjectResponse>;
  /** `providerId` and `model` change where the proposal runs before it starts; a null model is the provider default. */
  approveProposal: (args: {
    projectId: string;
    proposalId: string;
    providerId?: MissionProviderId;
    model?: string | null;
  }) => Promise<ProjectResponse>;
  rejectProposal: (args: { projectId: string; proposalId: string }) => Promise<ProjectResponse>;
  /** Starts a coordinator turn with the user's message; refused while it is answering. */
  messageCoordinator: (args: { projectId: string; text: string }) => Promise<ProjectResponse>;
  pause: (args: { projectId: string }) => Promise<ProjectResponse>;
  resume: (args: { projectId: string }) => Promise<ProjectResponse>;
  end: (args: { projectId: string; outcome: "completed" | "cancelled" }) => Promise<ProjectResponse>;
  updateSettings: (args: { projectId: string; settings: Partial<ProjectSettings> }) => Promise<ProjectResponse>;
  setMemoryStatus: (args: {
    projectId: string;
    memoryId: string;
    status: ProjectMemory["status"] | "removed";
  }) => Promise<ProjectResponse>;
  syncPlaybooks: (args: { playbooks: Playbook[] }) => Promise<{ ok: boolean }>;
  subscribeChanged: (listener: (event: ProjectChangedEvent) => void) => () => void;
}
