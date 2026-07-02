// ---------------------------------------------------------------------------
// Workspace Scripts – Manager pure helpers
// ---------------------------------------------------------------------------
//
// Extracted from the former monolithic WorkspaceScriptsManager so the container
// and tab components can share scope/dirty/hook-link logic without duplication.

import {
  SCRIPTS_CONFIG_FILENAME,
  SCRIPT_TRIGGER_IDS,
  STAVE_CONFIG_DIR,
} from "@/lib/workspace-scripts/constants";
import type {
  ScriptEditorCandidate,
  ScriptEditorHookLink,
  ScriptEditorState,
} from "@/lib/workspace-scripts/editor";
import type {
  ScriptKind,
  ScriptTrigger,
  WorkspaceScriptsConfig,
} from "@/lib/workspace-scripts/types";

export type ScriptEditorScopeId = "project" | "workspace";
export type ScriptsTabValue = "actions" | "services" | "hooks" | "targets";

export interface ScriptEditorScope {
  id: ScriptEditorScopeId;
  label: string;
  description: string;
  rootPath: string;
  filePath: string;
}

export interface EditorFileState {
  status: "idle" | "loading" | "ready" | "error";
  exists: boolean;
  revision: string | null;
  rawConfig: Record<string, unknown> | null;
  parsedConfig: WorkspaceScriptsConfig | null;
  error: string;
}

export function snapshotScriptEditorState(state: ScriptEditorState) {
  return JSON.stringify(state);
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildEditorScopes(args: {
  projectPath: string;
  workspacePath: string;
}) {
  const scopes: ScriptEditorScope[] = [
    {
      id: "project",
      label: "Project Config",
      description: "Shared scripts config stored in `.stave/scripts.json` for the repository.",
      rootPath: args.projectPath,
      filePath: `${STAVE_CONFIG_DIR}/${SCRIPTS_CONFIG_FILENAME}`,
    },
  ];

  if (args.workspacePath && args.workspacePath !== args.projectPath) {
    scopes.unshift({
      id: "workspace",
      label: "Workspace Config",
      description: "Highest-priority shared scripts config stored in `.stave/scripts.json` for the active workspace.",
      rootPath: args.workspacePath,
      filePath: `${STAVE_CONFIG_DIR}/${SCRIPTS_CONFIG_FILENAME}`,
    });
  }

  return scopes;
}

export function targetLabel(
  targetId: string,
  knownTargets: Array<{ id: string; label: string }>,
) {
  return knownTargets.find((target) => target.id === targetId)?.label ?? targetId;
}

export function isHookLinked(
  links: ScriptEditorHookLink[] | undefined,
  candidate: ScriptEditorCandidate,
) {
  return (links ?? []).some((link) => (
    link.scriptId === candidate.scriptId
    && (link.scriptKind === candidate.scriptKind || link.scriptKind === null)
  ));
}

export function getHookBlocking(
  links: ScriptEditorHookLink[] | undefined,
  candidate: ScriptEditorCandidate,
) {
  return (links ?? []).find((link) => (
    link.scriptId === candidate.scriptId
    && (link.scriptKind === candidate.scriptKind || link.scriptKind === null)
  ))?.blocking ?? true;
}

export function removeMatchingHookLinks(
  links: ScriptEditorHookLink[] | undefined,
  args: { scriptId: string; scriptKind: ScriptKind },
) {
  return (links ?? []).filter((link) => !(
    link.scriptId === args.scriptId
    && link.scriptKind === args.scriptKind
  ));
}

export function collectEntryTriggers(args: {
  entryId: string;
  kind: ScriptKind;
  hooks: ScriptEditorState["hooks"];
}): ScriptTrigger[] {
  const entryId = args.entryId.trim();
  if (!entryId) {
    return [];
  }
  return SCRIPT_TRIGGER_IDS.filter((trigger) => (
    (args.hooks[trigger] ?? []).some((link) => (
      link.scriptId === entryId
      && (link.scriptKind === args.kind || link.scriptKind === null)
    ))
  ));
}

/** Count of entries in a collection whose trimmed id duplicates an earlier one. */
export function findDuplicateEntryIds(entries: Array<{ id: string }>): Set<number> {
  const seen = new Map<string, number>();
  const duplicates = new Set<number>();
  entries.forEach((entry, index) => {
    const id = entry.id.trim();
    if (!id) {
      return;
    }
    if (seen.has(id)) {
      duplicates.add(index);
    } else {
      seen.set(id, index);
    }
  });
  return duplicates;
}
