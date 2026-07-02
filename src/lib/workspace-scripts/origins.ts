// ---------------------------------------------------------------------------
// Workspace Scripts – Entry/Target Origin Derivation (renderer-side)
// ---------------------------------------------------------------------------
//
// Mirrors the tier precedence implemented by the main-process loader in
// `electron/main/workspace-scripts/config-loader.ts`: the first tier with a
// parseable base config wins entirely (workspace pair > project pair). The
// optional `userOverridePath` tier is not modeled here because no renderer
// caller passes it. Keep both files in sync when precedence rules change.

import { ScriptsConfigSchema, ScriptsLocalConfigSchema } from "./schemas";
import { scriptEntryKey } from "./runtime-state";
import type { WorkspaceScriptsConfig, WorkspaceScriptsLocalConfig } from "./types";

export type ScriptOriginTier = "workspace" | "project";

export interface ScriptEntryOrigin {
  tier: ScriptOriginTier;
  localOverride: boolean;
}

export interface ScriptEntryOrigins {
  /** Which config tier the resolved config comes from; null when no base file parses. */
  activeTier: ScriptOriginTier | null;
  /** Origin per script entry, keyed by `"<kind>:<id>"`. */
  originByKey: Record<string, ScriptEntryOrigin>;
  /** Origin per target id. */
  targetOriginById: Record<string, ScriptEntryOrigin>;
}

function parseJson(content: string | null | undefined): unknown {
  if (!content?.trim()) {
    return null;
  }
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export function parseScriptsConfigContent(
  content: string | null | undefined,
): WorkspaceScriptsConfig | null {
  const parsed = ScriptsConfigSchema.safeParse(parseJson(content));
  return parsed.success ? parsed.data : null;
}

export function parseScriptsLocalConfigContent(
  content: string | null | undefined,
): WorkspaceScriptsLocalConfig | null {
  const parsed = ScriptsLocalConfigSchema.safeParse(parseJson(content));
  return parsed.success ? parsed.data : null;
}

/**
 * Derive per-entry origins from raw config file contents.
 *
 * Pass `null` for the workspace pair when the workspace root equals the
 * project root (no separate workspace tier). Legacy v1 configs do not parse
 * against the v2 schema, so entries resolved from legacy files simply have no
 * origin entry — callers should treat a missing origin as "unknown".
 */
export function deriveScriptEntryOrigins(args: {
  workspaceBase: string | null;
  workspaceLocal: string | null;
  projectBase: string | null;
  projectLocal: string | null;
}): ScriptEntryOrigins {
  const tiers: Array<{
    tier: ScriptOriginTier;
    base: WorkspaceScriptsConfig | null;
    local: WorkspaceScriptsLocalConfig | null;
  }> = [
    {
      tier: "workspace",
      base: parseScriptsConfigContent(args.workspaceBase),
      local: parseScriptsLocalConfigContent(args.workspaceLocal),
    },
    {
      tier: "project",
      base: parseScriptsConfigContent(args.projectBase),
      local: parseScriptsLocalConfigContent(args.projectLocal),
    },
  ];

  const active = tiers.find((tier) => tier.base !== null);
  if (!active?.base) {
    return { activeTier: null, originByKey: {}, targetOriginById: {} };
  }

  const originByKey: Record<string, ScriptEntryOrigin> = {};
  const localActionIds = new Set(Object.keys(active.local?.actions ?? {}));
  const localServiceIds = new Set(Object.keys(active.local?.services ?? {}));

  for (const id of new Set([...Object.keys(active.base.actions ?? {}), ...localActionIds])) {
    originByKey[scriptEntryKey("action", id)] = {
      tier: active.tier,
      localOverride: localActionIds.has(id),
    };
  }
  for (const id of new Set([...Object.keys(active.base.services ?? {}), ...localServiceIds])) {
    originByKey[scriptEntryKey("service", id)] = {
      tier: active.tier,
      localOverride: localServiceIds.has(id),
    };
  }

  const targetOriginById: Record<string, ScriptEntryOrigin> = {};
  const localTargetIds = new Set(Object.keys(active.local?.targets ?? {}));
  for (const id of new Set([...Object.keys(active.base.targets ?? {}), ...localTargetIds])) {
    targetOriginById[id] = {
      tier: active.tier,
      localOverride: localTargetIds.has(id),
    };
  }

  return { activeTier: active.tier, originByKey, targetOriginById };
}
