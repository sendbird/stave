import { z } from "zod";

export const STAVE_SYNC_CONTRACT_VERSION = "stave-sync-v1" as const;

export const STAVE_SYNC_LIMITS = Object.freeze({
  batch: 20,
  branch: 200,
  label: 300,
  linksPerMerge: 50,
  note: 500,
  summary: 2_000,
  url: 2_048,
  workspaceName: 200,
});

const httpsUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(STAVE_SYNC_LIMITS.url)
  .url()
  .refine((value) => value.startsWith("https://"), {
    message: "Martin sync links must use HTTPS.",
  });

export const STAVE_SYNC_EVENT_KINDS = [
  "pr_opened",
  "task_completed",
  "workspace_linked",
  "workspace_unlinked",
  "work_update",
] as const;

export const STAVE_SYNC_LINK_KINDS = [
  "prd",
  "api_spec",
  "figma",
  "slack",
  "github",
  "other",
] as const;

export const StaveSyncEventV1Schema = z
  .object({
    staveEventId: z.string().uuid(),
    kind: z.enum(STAVE_SYNC_EVENT_KINDS),
    summary: z.string().trim().min(1).max(STAVE_SYNC_LIMITS.summary),
    sourceUrl: httpsUrlSchema.nullish(),
    tier: z.enum(["factual", "interpretive"]).default("factual"),
    workspaceName: z
      .string()
      .trim()
      .min(1)
      .max(STAVE_SYNC_LIMITS.workspaceName),
    branch: z.string().trim().max(STAVE_SYNC_LIMITS.branch).default(""),
  })
  .strict();

export const StaveSyncEventsRequestV1Schema = z
  .object({
    contract: z.literal(STAVE_SYNC_CONTRACT_VERSION),
    events: z.array(StaveSyncEventV1Schema).min(1).max(STAVE_SYNC_LIMITS.batch),
  })
  .strict();

export const StaveSyncEventsResponseV1Schema = z
  .object({
    contract: z.literal(STAVE_SYNC_CONTRACT_VERSION),
    results: z.array(
      z
        .object({
          staveEventId: z.string().uuid(),
          status: z.enum(["inserted", "duplicate"]),
        })
        .strict(),
    ),
  })
  .strict();

export const StaveSyncLinkV1Schema = z
  .object({
    kind: z.enum(STAVE_SYNC_LINK_KINDS),
    label: z.string().trim().min(1).max(STAVE_SYNC_LIMITS.label),
    url: httpsUrlSchema,
    note: z.string().max(STAVE_SYNC_LIMITS.note).default(""),
  })
  .strict();

export const StaveSyncLinksMergeRequestV1Schema = z
  .object({
    contract: z.literal(STAVE_SYNC_CONTRACT_VERSION),
    links: z
      .array(StaveSyncLinkV1Schema)
      .min(1)
      .max(STAVE_SYNC_LIMITS.linksPerMerge),
  })
  .strict();

export const StaveSyncLinksMergeResponseV1Schema = z
  .object({
    contract: z.literal(STAVE_SYNC_CONTRACT_VERSION),
    results: z.array(
      z
        .object({
          url: z.string(),
          action: z.enum(["inserted", "updated", "skipped"]),
        })
        .strict(),
    ),
  })
  .strict();

export const MartinProjectRowV1Schema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    summary: z.string(),
    status: z.enum(["active", "archived"]),
    visibility: z.enum(["personal", "shared"]),
    syncIntervalMinutes: z.number(),
    lastSyncedAt: z.string().nullable(),
    archivedAt: z.string().nullable(),
    archiveReason: z.string().nullable(),
    createdBy: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();

export const MartinProjectListItemV1Schema = MartinProjectRowV1Schema.pick(
  {
    id: true,
    slug: true,
    name: true,
    summary: true,
    status: true,
    visibility: true,
    updatedAt: true,
  },
);

export const MartinProjectListResponseV1Schema = z
  .object({
    contract: z.literal(STAVE_SYNC_CONTRACT_VERSION),
    projects: z.array(MartinProjectListItemV1Schema),
    total: z.number().int().nonnegative(),
  })
  .strict();

const bundleSectionsSchema = z
  .object({
    members: z.array(
      z
        .object({
          id: z.string(),
          role: z.string(),
          name: z.string(),
          userId: z.string().nullable(),
          scope: z.string(),
          position: z.number(),
        })
        .strict(),
    ),
    links: z.array(
      z
        .object({
          id: z.string(),
          kind: z.enum(STAVE_SYNC_LINK_KINDS),
          label: z.string(),
          url: z.string(),
          note: z.string(),
          origin: z.enum(["stave"]).nullable(),
          position: z.number(),
        })
        .strict(),
    ),
    properties: z.array(
      z
        .object({
          id: z.string(),
          group: z.enum(["environment", "github"]),
          label: z.string(),
          value: z.string(),
          position: z.number(),
        })
        .strict(),
    ),
    stages: z.array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          plannedDate: z.string(),
          actualDate: z.string(),
          status: z.enum(["예정", "진행중", "대기", "완료", "지연", "취소"]),
          note: z.string(),
          position: z.number(),
        })
        .strict(),
    ),
    memory: z.array(
      z
        .object({
          id: z.string(),
          kind: z.enum(["decision", "constraint", "gotcha"]),
          body: z.string(),
          sourceUrl: z.string().nullable(),
          sourceLabel: z.string().nullable(),
          autoExtracted: z.boolean(),
          changeEventId: z.string().nullable(),
          position: z.number(),
        })
        .strict(),
    ),
  })
  .strict();

export const MartinContextBundleV1Schema = z
  .object({
    contract: z.literal(STAVE_SYNC_CONTRACT_VERSION),
    project: MartinProjectRowV1Schema,
    sections: bundleSectionsSchema,
    events: z.array(
      z
        .object({
          id: z.string(),
          projectId: z.string(),
          source: z.string(),
          kind: z.string(),
          summary: z.string(),
          sourceUrl: z.string().nullable(),
          tier: z.enum(["factual", "interpretive"]),
          metadata: z.record(z.string(), z.unknown()),
          detectedAt: z.string(),
        })
        .strict(),
    ),
    markdown: z.string(),
  })
  .strict();

export type MartinProjectSummary = {
  ref: string;
  slug: string;
  name: string;
  status: "active" | "archived";
  summary: string;
  url: string;
  updatedAt: string;
};

type MartinProjectSummarySource = z.infer<
  typeof MartinProjectListItemV1Schema
>;

export function toMartinProjectSummary(
  row: MartinProjectSummarySource,
  baseUrl: string,
): MartinProjectSummary {
  return {
    ref: row.slug,
    slug: row.slug,
    name: row.name,
    status: row.status,
    summary: row.summary,
    url: `${baseUrl.replace(/\/+$/, "")}/apps/martin/p/${row.slug}`,
    updatedAt: row.updatedAt,
  };
}

export type StaveSyncEventKind = (typeof STAVE_SYNC_EVENT_KINDS)[number];
export type StaveSyncEventV1 = z.infer<typeof StaveSyncEventV1Schema>;
export type StaveSyncLinkV1 = z.infer<typeof StaveSyncLinkV1Schema>;
export type MartinProjectRowV1 = z.infer<
  typeof MartinProjectRowV1Schema
>;
export type MartinContextBundleV1 = z.infer<
  typeof MartinContextBundleV1Schema
>;
