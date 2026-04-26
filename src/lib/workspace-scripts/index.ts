// ---------------------------------------------------------------------------
// Workspace Scripts – Public API
// ---------------------------------------------------------------------------

export type {
  ScriptHookContext,
  ScriptKind,
  ScriptTargetScope,
  ScriptTrigger,
  ResolvedScriptTarget,
  ResolvedWorkspaceScript,
  ResolvedWorkspaceScriptOrbitConfig,
  ResolvedWorkspaceScriptHook,
  ResolvedWorkspaceScriptsConfig,
  WorkspaceScriptActionConfig,
  WorkspaceScriptEvent,
  WorkspaceScriptEventEnvelope,
  WorkspaceScriptHookRef,
  WorkspaceScriptHookRunSummary,
  WorkspaceScriptOrbitConfig,
  WorkspaceScriptRunSource,
  WorkspaceScriptServiceConfig,
  WorkspaceScriptStatusEntry,
  WorkspaceScriptTargetConfig,
  WorkspaceScriptsConfig,
  WorkspaceScriptsLocalConfig,
} from "./types";

export {
  SCRIPTS_CONFIG_FILENAME,
  SCRIPTS_LOCAL_CONFIG_FILENAME,
  SCRIPT_ENV_VARS,
  SCRIPT_TRIGGER_IDS,
  SCRIPT_TRIGGER_METADATA,
  DEFAULT_SCRIPT_TARGET_IDS,
  SCRIPT_LOG_HISTORY_LIMIT,
  STAVE_CONFIG_DIR,
  WORKSPACE_SCRIPTS_IPC,
} from "./constants";

export {
  createDefaultScriptTargets,
  getScriptEntry,
  getScriptHooksForTrigger,
  hasAnyScripts,
  listScriptEntries,
  mergeScriptsConfig,
  resolveScriptsFromConfig,
  resolveScriptConfigFromTiers,
} from "./config";
