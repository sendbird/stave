import { getEffectiveSkillEntries } from "@/lib/skills/catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { SkillCatalogEntry } from "@/lib/skills/types";

const CREATE_PR_SHIP_SKILL_SLUG = "ship";

export type CreatePrShipAvailability =
  | { status: "ready"; invocationToken: string }
  | { status: "loading" }
  | { status: "missing" }
  | { status: "error" };

function normalizeWorkspacePath(value?: string | null) {
  return (value ?? "").trim().replace(/[\\/]+$/, "");
}

export function resolveCreatePrShipAvailability(args: {
  catalogStatus: "idle" | "loading" | "ready" | "error";
  catalogWorkspacePath?: string | null;
  workspacePath?: string | null;
  skills: readonly SkillCatalogEntry[];
  providerId: ProviderId;
}): CreatePrShipAvailability {
  if (args.catalogStatus === "error") {
    return { status: "error" };
  }

  if (
    args.catalogStatus !== "ready" ||
    !normalizeWorkspacePath(args.workspacePath) ||
    normalizeWorkspacePath(args.catalogWorkspacePath) !==
      normalizeWorkspacePath(args.workspacePath)
  ) {
    return { status: "loading" };
  }

  const shipSkill = getEffectiveSkillEntries({
    skills: args.skills,
    providerId: args.providerId,
  }).find((skill) => skill.slug.toLowerCase() === CREATE_PR_SHIP_SKILL_SLUG);

  if (!shipSkill) {
    return { status: "missing" };
  }

  return {
    status: "ready",
    invocationToken: shipSkill.invocationToken,
  };
}

export function buildCreatePrShipPrompt(invocationToken: string) {
  const normalizedToken = invocationToken.trim() || "$ship";
  return `${normalizedToken} Ship the completed change in this workspace as a ready pull request and enable auto-merge.`;
}

export function isCreatePrWorkspaceStateActive(args: {
  activeWorkspaceId: string;
  stateWorkspaceId?: string | null;
}) {
  return Boolean(
    args.activeWorkspaceId &&
    args.stateWorkspaceId &&
    args.activeWorkspaceId === args.stateWorkspaceId,
  );
}
