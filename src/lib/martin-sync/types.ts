import { z } from "zod";

import {
  STAVE_SYNC_EVENT_KINDS,
  STAVE_SYNC_LIMITS,
  StaveSyncLinkV1Schema,
} from "./contract";

export const MartinSyncSettingsSchema = z
  .object({
    enabled: z.boolean(),
    prOpened: z.boolean(),
    taskCompleted: z.boolean(),
    resourceLinks: z.boolean(),
    turnSummaries: z.boolean(),
  })
  .strict();

export type MartinSyncSettings = z.infer<
  typeof MartinSyncSettingsSchema
>;

export interface MartinSyncPublicStatus {
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

export interface MartinSyncMappingStalePayload {
  workspaceId: string;
  projectRef: string;
  code: "project_not_found" | "project_archived";
}

export const DEFAULT_MARTIN_SYNC_SETTINGS: MartinSyncSettings =
  Object.freeze({
    enabled: false,
    prOpened: true,
    taskCompleted: true,
    resourceLinks: true,
    turnSummaries: false,
  });

export function normalizeMartinSyncSettings(
  value: unknown,
): MartinSyncSettings {
  const parsed = MartinSyncSettingsSchema.safeParse(value);
  if (parsed.success) return parsed.data;

  const source = value && typeof value === "object" ? value : {};
  const candidate = source as Partial<Record<keyof MartinSyncSettings, unknown>>;
  return {
    enabled:
      typeof candidate.enabled === "boolean"
        ? candidate.enabled
        : DEFAULT_MARTIN_SYNC_SETTINGS.enabled,
    prOpened:
      typeof candidate.prOpened === "boolean"
        ? candidate.prOpened
        : DEFAULT_MARTIN_SYNC_SETTINGS.prOpened,
    taskCompleted:
      typeof candidate.taskCompleted === "boolean"
        ? candidate.taskCompleted
        : DEFAULT_MARTIN_SYNC_SETTINGS.taskCompleted,
    resourceLinks:
      typeof candidate.resourceLinks === "boolean"
        ? candidate.resourceLinks
        : DEFAULT_MARTIN_SYNC_SETTINGS.resourceLinks,
    turnSummaries:
      typeof candidate.turnSummaries === "boolean"
        ? candidate.turnSummaries
        : DEFAULT_MARTIN_SYNC_SETTINGS.turnSummaries,
  };
}

export const MartinSyncConfigureArgsSchema = MartinSyncSettingsSchema;

export const MartinListProjectsArgsSchema = z
  .object({
    query: z.string().trim().max(200).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict();

export const MartinWorkspaceArgsSchema = z
  .object({ workspaceId: z.string().trim().min(1).max(256) })
  .strict();

export const MartinLinkProjectArgsSchema = z
  .object({
    workspaceId: z.string().trim().min(1).max(256),
    projectRef: z.string().trim().min(1).max(128),
  })
  .strict();

export const MartinSyncEnqueueArgsSchema = z
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

export const MartinSyncLinksChangedArgsSchema = z
  .object({
    workspaceId: z.string().trim().min(1).max(256),
    projectRef: z.string().trim().min(1).max(128),
    links: z
      .array(StaveSyncLinkV1Schema)
      .max(STAVE_SYNC_LIMITS.linksPerMerge),
  })
  .strict();

export type MartinListProjectsArgs = z.infer<
  typeof MartinListProjectsArgsSchema
>;
export type MartinWorkspaceArgs = z.infer<
  typeof MartinWorkspaceArgsSchema
>;
export type MartinLinkProjectArgs = z.infer<
  typeof MartinLinkProjectArgsSchema
>;
export type MartinSyncEnqueueArgs = z.infer<
  typeof MartinSyncEnqueueArgsSchema
>;
export type MartinSyncLinksChangedArgs = z.infer<
  typeof MartinSyncLinksChangedArgsSchema
>;
