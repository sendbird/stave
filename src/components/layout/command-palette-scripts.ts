import { useTranslation } from "@/i18n";
import { i18n } from "@/i18n";
// ---------------------------------------------------------------------------
// Workspace Scripts – Command palette contributor
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import { Sparkles, Square } from "lucide-react";
import { toast } from "@/components/ui";
import { SCRIPT_TRIGGER_METADATA } from "@/lib/workspace-scripts/constants";
import {
  runScriptEntry,
  runScriptHook,
  scriptEntryKey,
  stopScriptEntry,
  useWorkspaceScriptsRuntime,
  type ScriptEntryOrigin,
  type ScriptsRuntimeContext,
  type ScriptsRuntimeSnapshot,
} from "@/lib/workspace-scripts";
import type { ScriptTrigger } from "@/lib/workspace-scripts/types";
import {
  registerCommandPaletteContributor,
  type CommandPaletteAction,
} from "./command-palette-registry";

function describeOrigin(origin?: ScriptEntryOrigin): string | null {
  if (!origin) {
    return null;
  }
  const tier = origin.tier === "workspace" ? i18n.t("shell:commandPaletteScripts.workspace") : i18n.t("shell:commandPaletteScripts.repository");
  return origin.localOverride ? i18n.t("shell:commandPaletteScripts.local", { value1: tier }) : tier;
}

function joinSubtitle(
  parts: Array<string | null | undefined>,
): string | undefined {
  const filtered = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return filtered.length > 0 ? filtered.join(" · ") : undefined;
}

/**
 * Pure builder that turns a scripts runtime snapshot into command-palette
 * actions. Services toggle Run/Stop, actions guard against a second launch, and
 * hooks run their configured refs. Returns `[]` when no workspace/config.
 */
export function buildScriptsCommandPaletteActions(args: {
  snapshot: ScriptsRuntimeSnapshot;
  workspaceId: string | null;
}): CommandPaletteAction[] {
  const { snapshot, workspaceId } = args;
  const config = snapshot.config;
  if (!workspaceId || !config) {
    return [];
  }

  const actions: CommandPaletteAction[] = [];

  for (const entry of config.services) {
    const key = scriptEntryKey("service", entry.id);
    const running = snapshot.entries[key]?.running ?? false;
    const origin = describeOrigin(snapshot.origins.originByKey[key]);
    actions.push({
      id: `scripts.run.service.${entry.id}`,
      title: running
        ? i18n.t("shell:commandPaletteScripts.stopProcess", { value1: entry.label })
        : i18n.t("shell:commandPaletteScripts.startProcess", { value1: entry.label }),
      group: "scripts",
      icon: running ? Square : Sparkles,
      subtitle: joinSubtitle([entry.description, origin]),
      keywords: ["scripts", "process", "service", entry.id, entry.label],
      source: "dynamic",
      customizable: false,
      run: () => {
        if (running) {
          void stopScriptEntry({
            workspaceId,
            scriptId: entry.id,
            scriptKind: "service",
          });
        } else {
          void runScriptEntry({
            workspaceId,
            scriptId: entry.id,
            scriptKind: "service",
          });
        }
      },
    });
  }

  for (const entry of config.actions) {
    const key = scriptEntryKey("action", entry.id);
    const running = snapshot.entries[key]?.running ?? false;
    const origin = describeOrigin(snapshot.origins.originByKey[key]);
    actions.push({
      id: `scripts.run.action.${entry.id}`,
      title: i18n.t("shell:commandPaletteScripts.runCommand", { value1: entry.label }),
      group: "scripts",
      icon: Sparkles,
      subtitle: joinSubtitle([entry.description, origin]),
      keywords: ["scripts", "command", "action", entry.id, entry.label],
      source: "dynamic",
      customizable: false,
      run: () => {
        if (running) {
          toast.message(i18n.t("shell:commandPaletteScripts.commandAlreadyRunning"));
          return;
        }
        void runScriptEntry({
          workspaceId,
          scriptId: entry.id,
          scriptKind: "action",
        });
      },
    });
  }

  for (const trigger of Object.keys(config.hooks) as ScriptTrigger[]) {
    const refs = config.hooks[trigger];
    if (!refs?.length) {
      continue;
    }
    const meta = SCRIPT_TRIGGER_METADATA[trigger];
    actions.push({
      id: `scripts.hook.${trigger}`,
      title: i18n.t("shell:commandPaletteScripts.runTrigger", { value1: meta.label }),
      group: "scripts",
      icon: Sparkles,
      subtitle: joinSubtitle([
        meta.description,
        i18n.t("shell:commandPaletteScripts.linkedExecution", { count: refs.length }),
      ]),
      keywords: ["scripts", "trigger", "hook", trigger, meta.label],
      source: "dynamic",
      customizable: false,
      run: () => {
        void runScriptHook({ workspaceId, trigger });
      },
    });
  }

  return actions;
}

/**
 * Acquire the active workspace's scripts runtime and register a command-palette
 * contributor that reads the latest snapshot via refs (so the registration is
 * stable across re-renders). Returns the snapshot revision; thread it into the
 * palette runtime context so memoized consumers re-run the contributor.
 */
export function useScriptsCommandPaletteContributor(
  args: ScriptsRuntimeContext | null,
): number {
  useTranslation();
  const snapshot = useWorkspaceScriptsRuntime(args);
  const workspaceId = args?.workspaceId ?? null;

  const snapshotRef = useRef(snapshot);
  const workspaceIdRef = useRef(workspaceId);
  snapshotRef.current = snapshot;
  workspaceIdRef.current = workspaceId;

  useEffect(() => {
    return registerCommandPaletteContributor(() =>
      buildScriptsCommandPaletteActions({
        snapshot: snapshotRef.current,
        workspaceId: workspaceIdRef.current,
      }),
    );
  }, []);

  return snapshot.revision;
}
