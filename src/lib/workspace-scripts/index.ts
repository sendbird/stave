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
  WORKSPACE_TOOLS_LABEL,
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

export type { ScriptUiState } from "./runtime-state";
export {
  appendScriptLog,
  buildEntryStateFromStatus,
  buildScriptRunFailureState,
  countRunningServiceEntries,
  formatScriptDuration,
  formatScriptRelativeTime,
  getScriptRunSourceLabel,
  getScriptSourceLabel,
  reduceScriptUiState,
  scriptEntryKey,
} from "./runtime-state";

export { stripAnsiControlSequences } from "./ansi";

export type {
  ScriptEntryOrigin,
  ScriptEntryOrigins,
  ScriptOriginTier,
} from "./origins";
export {
  deriveScriptEntryOrigins,
  parseScriptsConfigContent,
  parseScriptsLocalConfigContent,
} from "./origins";

export type {
  ScriptsConfigStatus,
  ScriptsRuntimeContext,
  ScriptsRuntimeSnapshot,
} from "./runtime-store";
export {
  acquireScriptsRuntime,
  clearScriptLog,
  EMPTY_SNAPSHOT,
  getScriptsRuntimeSnapshot,
  refreshScriptsRuntime,
  runScriptEntry,
  runScriptHook,
  stopAllScripts,
  stopScriptEntry,
  subscribeScriptsRuntime,
  subscribeScriptsRuntimeAny,
} from "./runtime-store";

export { persistWorkspaceServiceQuickAdd } from "./quick-add";

export {
  useRunningWorkspaceProcessCount,
  useWorkspaceScriptsRuntime,
} from "./use-workspace-scripts-runtime";

export type {
  FileVerificationStatus,
  TurnVerificationResult,
  TurnVerificationStatus,
  VerificationFixPromptOptions,
  VerificationStatusVisual,
} from "./verification";

export {
  buildTurnVerificationResult,
  buildVerificationFixPrompt,
  deriveFileVerificationStatuses,
  describeTurnVerification,
  deriveTurnVerificationStatus,
  VERIFICATION_FIX_OUTPUT_LIMIT,
  VERIFICATION_STATUS_VISUAL,
} from "./verification";
