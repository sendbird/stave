import type { ProviderId } from "@/lib/providers/provider.types";

export interface CompareRunVariantConfig {
  provider: ProviderId;
  model?: string;
  label?: string;
}

export type CompareRunStatus =
  | "starting"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type CompareRunVariantStatus =
  | "pending"
  | "creating"
  | "running"
  | "failed"
  | "kept"
  | "discarded";

export interface CompareRunVariant extends CompareRunVariantConfig {
  id: string;
  status: CompareRunVariantStatus;
  workspaceId?: string;
  workspaceName?: string;
  workspacePath?: string;
  branchName?: string;
  taskId?: string;
  error?: string;
}

export interface CompareRun {
  id: string;
  seedPrompt: string;
  baseWorkspaceId: string;
  baseBranch?: string;
  createdAt: string;
  updatedAt: string;
  status: CompareRunStatus;
  variants: CompareRunVariant[];
  keptVariantId?: string;
  error?: string;
}

export interface StartCompareRunResult {
  ok: boolean;
  compareRunId?: string;
  message?: string;
}

export function buildDefaultCompareVariants(args: {
  modelClaude: string;
  modelCodex: string;
}): CompareRunVariantConfig[] {
  return [
    {
      provider: "claude-code",
      model: args.modelClaude,
      label: "Claude",
    },
    {
      provider: "codex",
      model: args.modelCodex,
      label: "Codex",
    },
  ];
}

export function normalizeCompareVariants(
  variants: CompareRunVariantConfig[] | undefined,
): CompareRunVariantConfig[] {
  const normalized = (variants ?? []).flatMap((variant) => {
    if (variant.provider !== "claude-code" && variant.provider !== "codex") {
      return [];
    }
    return [
      {
        provider: variant.provider,
        model: variant.model?.trim() || undefined,
        label: variant.label?.trim() || undefined,
      },
    ];
  });

  return normalized.slice(0, 3);
}

export function buildCompareRunVariantId(args: {
  compareRunId: string;
  index: number;
}) {
  return `${args.compareRunId}:variant-${args.index + 1}`;
}

export function deriveCompareSeedTitle(seedPrompt: string) {
  const firstLine = seedPrompt
    .split("\n")
    .find((line) => line.trim().length > 0)
    ?.trim();
  return firstLine?.slice(0, 48) || "Compare run";
}

export function buildCompareWorkspaceName(args: {
  seedPrompt: string;
  compareRunId: string;
  index: number;
  provider: ProviderId;
}) {
  const providerSlug =
    args.provider === "claude-code" ? "claude" : args.provider;
  const title = deriveCompareSeedTitle(args.seedPrompt)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  const suffix = args.compareRunId.slice(0, 8);
  return [
    "compare",
    suffix,
    `${args.index + 1}-${providerSlug}`,
    title,
  ]
    .filter(Boolean)
    .join("/");
}

export function buildInitialCompareRun(args: {
  id: string;
  seedPrompt: string;
  baseWorkspaceId: string;
  baseBranch?: string;
  variants: CompareRunVariantConfig[];
  now: string;
}): CompareRun {
  return {
    id: args.id,
    seedPrompt: args.seedPrompt,
    baseWorkspaceId: args.baseWorkspaceId,
    baseBranch: args.baseBranch,
    createdAt: args.now,
    updatedAt: args.now,
    status: "starting",
    variants: args.variants.map((variant, index) => ({
      id: buildCompareRunVariantId({ compareRunId: args.id, index }),
      provider: variant.provider,
      model: variant.model,
      label: variant.label,
      status: "pending",
    })),
  };
}

