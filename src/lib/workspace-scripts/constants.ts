import { i18n } from "@/i18n/runtime";
// ---------------------------------------------------------------------------
// Workspace Scripts – Constants
// ---------------------------------------------------------------------------

import type { ScriptTrigger } from "./types";

export const STAVE_CONFIG_DIR = ".stave";
export const SCRIPTS_CONFIG_FILENAME = "scripts.json";
export const SCRIPTS_LOCAL_CONFIG_FILENAME = "scripts.local.json";
export const SCRIPT_LOG_HISTORY_LIMIT = 12_000;
export const WORKSPACE_TOOLS_LABEL_KEY = "scripts:workspaceTools.title" as const;

export const SCRIPT_TRIGGER_IDS: readonly ScriptTrigger[] = [
  "task.created",
  "task.archiving",
  "turn.started",
  "turn.completed",
  "pr.beforeOpen",
  "pr.afterOpen",
] as const;

export const SCRIPT_TRIGGER_METADATA: Record<
  ScriptTrigger,
  {
    label: string;
    description: string;
  }
> = {
  "task.created": {
    get label() { return i18n.t("scripts:constants.taskCreated"); },
    get description() { return i18n.t("scripts:constants.runsWhenStaveCreatesANewTask"); },
  },
  "task.archiving": {
    get label() { return i18n.t("scripts:constants.taskArchiving"); },
    get description() { return i18n.t("scripts:constants.runsWhenStaveArchivesATaskFrom"); },
  },
  "turn.started": {
    get label() { return i18n.t("scripts:constants.turnStarted"); },
    get description() { return i18n.t("scripts:constants.runsWhenAProviderTurnStartsFor"); },
  },
  "turn.completed": {
    get label() { return i18n.t("scripts:constants.turnCompleted"); },
    get description() { return i18n.t("scripts:constants.runsAfterAProviderTurnFinishesAnd"); },
  },
  "pr.beforeOpen": {
    get label() { return i18n.t("scripts:constants.prBeforeOpen"); },
    get description() { return i18n.t("scripts:constants.runsBeforeStavePushesAndOpensA"); },
  },
  "pr.afterOpen": {
    get label() { return i18n.t("scripts:constants.prAfterOpen"); },
    get description() { return i18n.t("scripts:constants.runsAfterStaveOpensAPullRequest"); },
  },
};

export const DEFAULT_SCRIPT_TARGET_IDS = {
  WORKSPACE: "workspace",
  REPOSITORY: "project",
} as const;

export const SCRIPT_ENV_VARS = {
  ROOT_PATH: "STAVE_ROOT_PATH",
  WORKSPACE_NAME: "STAVE_WORKSPACE_NAME",
  WORKSPACE_PATH: "STAVE_WORKSPACE_PATH",
  BRANCH: "STAVE_BRANCH",
  TASK_ID: "STAVE_TASK_ID",
  TASK_TITLE: "STAVE_TASK_TITLE",
  TURN_ID: "STAVE_TURN_ID",
  TARGET_ID: "STAVE_SCRIPT_TARGET_ID",
  TRIGGER: "STAVE_SCRIPT_TRIGGER",
} as const;

export const WORKSPACE_SCRIPTS_IPC = {
  GET_CONFIG: "workspace-scripts:get-config",
  GET_STATUS: "workspace-scripts:get-status",
  RUN_ENTRY: "workspace-scripts:run-entry",
  STOP_ENTRY: "workspace-scripts:stop-entry",
  RUN_HOOK: "workspace-scripts:run-hook",
  STOP_ALL: "workspace-scripts:stop-all",
  SUBSCRIBE_EVENTS: "workspace-scripts:subscribe-events",
  UNSUBSCRIBE_EVENTS: "workspace-scripts:unsubscribe-events",
  EVENT: "workspace-scripts:event",
} as const;
