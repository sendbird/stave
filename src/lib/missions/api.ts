/**
 * The mission contract between the renderer, the main process and the host
 * service: command arguments, results and the change event.
 *
 * Used by:
 * - `electron/main/ipc/mission-schemas.ts` (validates these shapes)
 * - `electron/preload.ts` and `src/types/window-api.d.ts` (`window.api.missions`)
 * - `electron/host-service/supervision/mission-runtime.ts` (produces them)
 */
import type {
  Mission,
  MissionCommandErrorCode,
  MissionEvent,
  MissionStageRecord,
  MissionStartInput,
  MissionState,
} from "./domain";
import type { MissionReport } from "./report";
import type { MissionUsage } from "./usage";
import type { MissionInsights } from "./insights";

/** IPC channels behind `window.api.missions`, keyed by bridge method. */
export const MISSION_IPC = Object.freeze({
  start: "missions:start",
  list: "missions:list",
  insights: "missions:insights",
  get: "missions:get",
  signOff: "missions:sign-off",
  requestChanges: "missions:request-changes",
  skipStage: "missions:skip-stage",
  retryStage: "missions:retry-stage",
  pause: "missions:pause",
  resume: "missions:resume",
  takeOver: "missions:take-over",
  acceptRuntime: "missions:accept-runtime",
  noteUserTurn: "missions:note-user-turn",
  cancel: "missions:cancel",
  addReportToPullRequest: "missions:add-report-to-pr",
  shareReport: "missions:share-report",
  /** Main → renderer: a `MissionChangedEvent`. */
  changed: "missions:changed",
});

/**
 * The stage attempt a control was rendered against. A stage command aimed at
 * an attempt the mission has moved past is refused with `stale-identity`.
 */
export interface MissionStageRef {
  missionId: string;
  stageId: string;
  attempt: number;
}

export interface MissionIdArgs {
  missionId: string;
}

export interface MissionListArgs {
  /** Omit to list the newest missions across every workspace. */
  workspaceId?: string;
  limit?: number;
}

export interface MissionRequestChangesArgs extends MissionStageRef {
  feedback: string;
}

/** The composer choice when the user sends a message during a mission. */
export const MISSION_USER_TURN_INTENTS = ["continue", "take-over"] as const;
export type MissionUserTurnIntent = (typeof MISSION_USER_TURN_INTENTS)[number];

export interface MissionNoteUserTurnArgs extends MissionIdArgs {
  intent: MissionUserTurnIntent;
}

export type MissionStartArgs = MissionStartInput;

/** A mission with its stage attempts, recent events and, once ended, its report. */
export interface MissionDetail {
  mission: Mission;
  stages: MissionStageRecord[];
  /** The newest events, oldest first. */
  events: MissionEvent[];
  /** Present on `get` once the mission has ended; null otherwise. */
  report: MissionReport | null;
  /** What the mission's turns spent so far, when the host reads usage. */
  usage?: MissionUsage;
}

/** Why a mission command failed; `failed` is anything unexpected. */
export type MissionFailureCode = MissionCommandErrorCode | "invalid-args" | "failed";

/** What the host returns for every mission action. */
export type MissionInvokeResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: MissionFailureCode; message: string };

export interface MissionCommandResponse {
  ok: boolean;
  mission: MissionDetail | null;
  code?: MissionFailureCode;
  message?: string;
}

export interface MissionReportPublishResponse {
  ok: boolean;
  prUrl?: string;
  code?: MissionFailureCode;
  message?: string;
}

export interface MissionShareReportResponse {
  ok: boolean;
  code?: MissionFailureCode;
  message?: string;
}

export interface MissionInsightsResponse {
  ok: boolean;
  insights: MissionInsights | null;
  message?: string;
}

export interface MissionListResponse {
  ok: boolean;
  missions: Mission[];
  code?: MissionFailureCode;
  message?: string;
}

/** Sent whenever a mission's state, stage or records change. */
export interface MissionChangedEvent {
  missionId: string;
  workspaceId: string;
  leadTaskId: string;
  state: MissionState;
  currentStageIndex: number;
  updatedAt: string;
}

/** `window.api.missions`. */
export interface MissionsBridgeApi {
  start: (args: MissionStartArgs) => Promise<MissionCommandResponse>;
  list: (args?: MissionListArgs) => Promise<MissionListResponse>;
  /** How missions that ended in the last `days` went, per playbook and provider. */
  insights: (args?: { days?: number }) => Promise<MissionInsightsResponse>;
  get: (args: MissionIdArgs) => Promise<MissionCommandResponse>;
  signOff: (args: MissionStageRef) => Promise<MissionCommandResponse>;
  requestChanges: (args: MissionRequestChangesArgs) => Promise<MissionCommandResponse>;
  skipStage: (args: MissionStageRef) => Promise<MissionCommandResponse>;
  retryStage: (args: MissionStageRef) => Promise<MissionCommandResponse>;
  pause: (args: MissionIdArgs) => Promise<MissionCommandResponse>;
  resume: (args: MissionIdArgs) => Promise<MissionCommandResponse>;
  takeOver: (args: MissionIdArgs) => Promise<MissionCommandResponse>;
  acceptRuntime: (args: MissionIdArgs) => Promise<MissionCommandResponse>;
  noteUserTurn: (args: MissionNoteUserTurnArgs) => Promise<MissionCommandResponse>;
  cancel: (args: MissionIdArgs) => Promise<MissionCommandResponse>;
  /** Adds the ended mission's report to its pull request, on request. */
  addReportToPullRequest: (args: MissionIdArgs) => Promise<MissionReportPublishResponse>;
  /** Posts the ended mission's report to a Slack thread, through a turn on its lead task. */
  shareReport: (args: { missionId: string; threadUrl: string }) => Promise<MissionShareReportResponse>;
  subscribeChanged: (listener: (event: MissionChangedEvent) => void) => () => void;
}
