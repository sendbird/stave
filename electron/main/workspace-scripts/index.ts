// ---------------------------------------------------------------------------
// Workspace Scripts – Electron Main Public API
// ---------------------------------------------------------------------------

export {
  resolveScriptsForWorkspace,
  type ResolveScriptsArgs,
} from "./config-loader";

export {
  ScriptsConfigSchema,
  ScriptsLocalConfigSchema,
} from "../../../src/lib/workspace-scripts/schemas";

export {
  cleanupAllScriptProcesses,
  getScriptStatuses,
  runScriptEntry,
  runScriptHook,
  setWorkspaceScriptEventListener,
  stopAllWorkspaceScriptProcesses,
  stopScriptEntry,
} from "./executor";

export {
  hasWorkspaceOrbitHost,
  type WorkspaceScriptProcess,
} from "./state";
