// ---------------------------------------------------------------------------
// Workspace Scripts – Config Loader (Electron main process)
// ---------------------------------------------------------------------------

import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  SCRIPTS_CONFIG_FILENAME,
  SCRIPTS_LOCAL_CONFIG_FILENAME,
  STAVE_CONFIG_DIR,
} from "../../../src/lib/workspace-scripts/constants";
import {
  resolveScriptConfigFromTiers,
} from "../../../src/lib/workspace-scripts/config";
import {
  ScriptsConfigSchema,
  ScriptsLocalConfigSchema,
} from "../../../src/lib/workspace-scripts/schemas";
import type {
  ResolvedWorkspaceScriptsConfig,
  WorkspaceScriptsConfig,
  WorkspaceScriptsLocalConfig,
} from "../../../src/lib/workspace-scripts/types";

async function readJsonFile<T>(filePath: string, schema: z.ZodType<T>): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const result = schema.safeParse(parsed);
    if (!result.success) {
      console.warn(`[workspace-scripts] Invalid config at ${filePath}:`, result.error.message);
      return null;
    }
    return result.data;
  } catch {
    return null;
  }
}

async function loadConfigPair(dir: string): Promise<{
  base: WorkspaceScriptsConfig | null;
  local: WorkspaceScriptsLocalConfig | null;
}> {
  const basePath = path.join(dir, STAVE_CONFIG_DIR, SCRIPTS_CONFIG_FILENAME);
  const localPath = path.join(dir, STAVE_CONFIG_DIR, SCRIPTS_LOCAL_CONFIG_FILENAME);

  const [base, local] = await Promise.all([
    readJsonFile(basePath, ScriptsConfigSchema),
    readJsonFile(localPath, ScriptsLocalConfigSchema),
  ]);

  return { base, local };
}

export interface ResolveScriptsArgs {
  projectPath: string;
  workspacePath: string;
  userOverridePath?: string;
}

export async function resolveScriptsForWorkspace(
  args: ResolveScriptsArgs,
): Promise<ResolvedWorkspaceScriptsConfig | null> {
  const tiers: Array<{
    base: WorkspaceScriptsConfig | null;
    local: WorkspaceScriptsLocalConfig | null;
  }> = [];

  if (args.userOverridePath) {
    const userBase = await readJsonFile(
      path.join(args.userOverridePath, SCRIPTS_CONFIG_FILENAME),
      ScriptsConfigSchema,
    );
    if (userBase) {
      tiers.push({ base: userBase, local: null });
    }
  }

  const normalizedWorkspace = path.resolve(args.workspacePath);
  const normalizedProject = path.resolve(args.projectPath);
  if (normalizedWorkspace !== normalizedProject) {
    tiers.push(await loadConfigPair(args.workspacePath));
  }

  tiers.push(await loadConfigPair(args.projectPath));

  return resolveScriptConfigFromTiers(tiers);
}
