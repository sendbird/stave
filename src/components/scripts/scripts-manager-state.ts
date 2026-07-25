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
  DEFAULT_SCRIPT_TARGET_IDS,
  WORKSPACE_TOOLS_LABEL,
} from "@/lib/workspace-scripts/constants";
import type { ScriptEntryOrigin } from "@/lib/workspace-scripts/origins";
import type {
  ScriptEditorCandidate,
  ScriptEditorHookLink,
  ScriptEditorState,
} from "@/lib/workspace-scripts/editor";
import { buildScriptEditorCandidates } from "@/lib/workspace-scripts/editor";
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

export function scriptEditorScopeKey(scope: ScriptEditorScope | null) {
  return scope ? `${scope.id}\0${scope.rootPath}\0${scope.filePath}` : "";
}

export function snapshotScriptEditorState(state: ScriptEditorState) {
  return JSON.stringify(state);
}

export function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
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
      description:
        "Shared execution config stored in `.stave/scripts.json` for the repository.",
      rootPath: args.projectPath,
      filePath: `${STAVE_CONFIG_DIR}/${SCRIPTS_CONFIG_FILENAME}`,
    },
  ];

  if (args.workspacePath && args.workspacePath !== args.projectPath) {
    scopes.unshift({
      id: "workspace",
      label: "Workspace Config",
      description:
        "Highest-priority shared execution config stored in `.stave/scripts.json` for the active workspace.",
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
  return (
    knownTargets.find((target) => target.id === targetId)?.label ?? targetId
  );
}

/**
 * Only expose targets owned or referenced by the file being edited.
 *
 * Resolved runtime targets can come from a higher-priority workspace config or
 * a developer-local override. Offering those while editing another scope makes
 * it possible to persist a reference that does not exist in the destination
 * file.
 */
export function buildEditorTargetOptions(state: ScriptEditorState) {
  const next = new Map<string, string>([
    [DEFAULT_SCRIPT_TARGET_IDS.WORKSPACE, "Workspace"],
    [DEFAULT_SCRIPT_TARGET_IDS.PROJECT, "Project"],
  ]);

  for (const target of state.targets) {
    const targetId = target.id.trim();
    if (targetId) {
      next.set(targetId, target.label.trim() || targetId);
    }
  }

  for (const entry of [...state.actions, ...state.services]) {
    const targetId = entry.target.trim();
    if (targetId) {
      next.set(targetId, next.get(targetId) ?? targetId);
    }
  }

  return [...next.entries()].map(([id, label]) => ({ id, label }));
}

export function buildEditorHookCandidates(state: ScriptEditorState) {
  return buildScriptEditorCandidates({ state });
}

/**
 * Running from the editor is safe only when the selected file is the exact
 * source of the effective runtime entry. A matching kind/id is insufficient:
 * workspace precedence and scripts.local.json can replace its commands.
 */
export function getScriptEditorRunDisabledReason(args: {
  entryId: string;
  isDirty: boolean;
  selectedScopeId: ScriptEditorScopeId;
  origin: ScriptEntryOrigin | undefined;
}) {
  if (args.isDirty) {
    return "Save changes first — Run executes the saved config.";
  }
  if (!args.entryId.trim() || !args.origin) {
    return "This entry is not active in the resolved config.";
  }
  if (args.origin.tier !== args.selectedScopeId) {
    const activeLabel =
      args.origin.tier === "workspace" ? "workspace" : "project";
    return `Runtime is using the ${activeLabel} config. Switch to that scope to run this entry.`;
  }
  if (args.origin.localOverride) {
    return `A local override changes this entry. Run the effective command from ${WORKSPACE_TOOLS_LABEL}.`;
  }
  return null;
}

export function isHookLinked(
  links: ScriptEditorHookLink[] | undefined,
  candidate: ScriptEditorCandidate,
) {
  return (links ?? []).some(
    (link) =>
      link.scriptId === candidate.scriptId &&
      (link.scriptKind === candidate.scriptKind || link.scriptKind === null),
  );
}

export function getHookBlocking(
  links: ScriptEditorHookLink[] | undefined,
  candidate: ScriptEditorCandidate,
) {
  return (
    (links ?? []).find(
      (link) =>
        link.scriptId === candidate.scriptId &&
        (link.scriptKind === candidate.scriptKind || link.scriptKind === null),
    )?.blocking ?? true
  );
}

export function removeMatchingHookLinks(
  links: ScriptEditorHookLink[] | undefined,
  args: { scriptId: string; scriptKind: ScriptKind },
) {
  return (links ?? []).filter(
    (link) =>
      !(link.scriptId === args.scriptId && link.scriptKind === args.scriptKind),
  );
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
  return SCRIPT_TRIGGER_IDS.filter((trigger) =>
    (args.hooks[trigger] ?? []).some(
      (link) =>
        link.scriptId === entryId &&
        (link.scriptKind === args.kind || link.scriptKind === null),
    ),
  );
}

/** Count of entries in a collection whose trimmed id duplicates an earlier one. */
export function findDuplicateEntryIds(
  entries: Array<{ id: string }>,
): Set<number> {
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
