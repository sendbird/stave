import { z } from "zod";

import {
  STAVE_SYNC_EVENT_KINDS,
  STAVE_SYNC_LIMITS,
  StaveSyncLinkV1Schema,
} from "./contract";

export const HirondelleSyncSettingsSchema = z
  .object({
    enabled: z.boolean(),
    prOpened: z.boolean(),
    taskCompleted: z.boolean(),
    resourceLinks: z.boolean(),
    turnSummaries: z.boolean(),
  })
  .strict();

export type HirondelleSyncSettings = z.infer<
  typeof HirondelleSyncSettingsSchema
>;

export interface HirondelleSyncPublicStatus {
  runtimeState:
    | "disabled"
    | "unpaired"
    | "idle"
    | "syncing"
    | "offline"
    | "unauthorized"
    | "error";
  lastErrorCode: string | null;
  pendingCount: number;
  failedCount: number;
  lastDeliveredAt: string | null;
}

export interface HirondelleSyncMappingStalePayload {
  workspaceId: string;
  projectRef: string;
  code: "project_not_found" | "project_archived";
}

export const DEFAULT_HIRONDELLE_SYNC_SETTINGS: HirondelleSyncSettings =
  Object.freeze({
    enabled: false,
    prOpened: true,
    taskCompleted: true,
    resourceLinks: true,
    turnSummaries: false,
  });

export function normalizeHirondelleSyncSettings(
  value: unknown,
): HirondelleSyncSettings {
  const parsed = HirondelleSyncSettingsSchema.safeParse(value);
  if (parsed.success) return parsed.data;

  const source = value && typeof value === "object" ? value : {};
  const candidate = source as Partial<Record<keyof HirondelleSyncSettings, unknown>>;
  return {
    enabled:
      typeof candidate.enabled === "boolean"
        ? candidate.enabled
        : DEFAULT_HIRONDELLE_SYNC_SETTINGS.enabled,
    prOpened:
      typeof candidate.prOpened === "boolean"
        ? candidate.prOpened
        : DEFAULT_HIRONDELLE_SYNC_SETTINGS.prOpened,
    taskCompleted:
      typeof candidate.taskCompleted === "boolean"
        ? candidate.taskCompleted
        : DEFAULT_HIRONDELLE_SYNC_SETTINGS.taskCompleted,
    resourceLinks:
      typeof candidate.resourceLinks === "boolean"
        ? candidate.resourceLinks
        : DEFAULT_HIRONDELLE_SYNC_SETTINGS.resourceLinks,
    turnSummaries:
      typeof candidate.turnSummaries === "boolean"
        ? candidate.turnSummaries
        : DEFAULT_HIRONDELLE_SYNC_SETTINGS.turnSummaries,
  };
}

export const HirondelleSyncConfigureArgsSchema = HirondelleSyncSettingsSchema;

export const HirondelleListProjectsArgsSchema = z
  .object({
    query: z.string().trim().max(200).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict();

export const HirondelleWorkspaceArgsSchema = z
  .object({ workspaceId: z.string().trim().min(1).max(256) })
  .strict();

export const HirondelleLinkProjectArgsSchema = z
  .object({
    workspaceId: z.string().trim().min(1).max(256),
    projectRef: z.string().trim().min(1).max(128),
  })
  .strict();

export const HirondelleSyncEnqueueArgsSchema = z
  .object({
    workspaceId: z.string().trim().min(1).max(256),
    projectRef: z.string().trim().min(1).max(128),
    kind: z.enum(STAVE_SYNC_EVENT_KINDS),
    summary: z.string().trim().min(1).max(STAVE_SYNC_LIMITS.summary),
    sourceUrl: z.string().trim().max(STAVE_SYNC_LIMITS.url).optional(),
    workspaceName: z
      .string()
      .trim()
      .min(1)
      .max(STAVE_SYNC_LIMITS.workspaceName),
    branch: z.string().trim().max(STAVE_SYNC_LIMITS.branch),
  })
  .strict();

export const HirondelleSyncLinksChangedArgsSchema = z
  .object({
    workspaceId: z.string().trim().min(1).max(256),
    projectRef: z.string().trim().min(1).max(128),
    links: z
      .array(StaveSyncLinkV1Schema)
      .max(STAVE_SYNC_LIMITS.linksPerMerge),
  })
  .strict();

export type HirondelleListProjectsArgs = z.infer<
  typeof HirondelleListProjectsArgsSchema
>;
export type HirondelleWorkspaceArgs = z.infer<
  typeof HirondelleWorkspaceArgsSchema
>;
export type HirondelleLinkProjectArgs = z.infer<
  typeof HirondelleLinkProjectArgsSchema
>;
export type HirondelleSyncEnqueueArgs = z.infer<
  typeof HirondelleSyncEnqueueArgsSchema
>;
export type HirondelleSyncLinksChangedArgs = z.infer<
  typeof HirondelleSyncLinksChangedArgsSchema
>;
