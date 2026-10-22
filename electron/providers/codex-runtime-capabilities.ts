import { i18n } from "../../src/i18n/runtime";
import type {
  ProviderRuntimeCapabilities,
  ProviderRuntimeOptions,
} from "../../src/lib/providers/provider.types";
import { resolveProviderRuntimeCapabilities } from "../../src/lib/providers/runtime-capabilities";
import { withoutCodexAutoReview } from "../../src/lib/providers/codex-runtime-options";
import { buildCodexCliEnv } from "./cli-path-env";
import { CodexAppServerRpcError } from "./codex-app-server-errors";
import { probeExecutableVersion } from "./runtime-shared";

const versionTextByExecutable = new Map<string, string>();

export function getCodexVersionCapabilities(
  executablePath: string,
): ProviderRuntimeCapabilities {
  let versionText = versionTextByExecutable.get(executablePath);
  if (versionText === undefined) {
    const probe = probeExecutableVersion({
      executablePath,
      env: buildCodexCliEnv({ executablePath }),
    });
    versionText = probe.status === 0 ? probe.text : "";
    versionTextByExecutable.set(executablePath, versionText);
  }
  return resolveProviderRuntimeCapabilities({
    providerId: "codex",
    versionText,
    available: Boolean(versionText),
  });
}

// Pure, so the run contract can state the same fallback before a run starts.
export { buildCodexApprovalsAppliedEvent, withoutCodexAutoReview } from "../../src/lib/providers/codex-runtime-options";

export function applyCodexRuntimeCapabilityDowngrades(args: {
  capabilities: ProviderRuntimeCapabilities;
  runtimeOptions?: ProviderRuntimeOptions;
}): ProviderRuntimeOptions | undefined {
  const reviewerField = args.capabilities.approval.autoClassifierPolicy;
  if (!args.runtimeOptions) {
    return reviewerField ? { codexApprovalsReviewer: "user" } : undefined;
  }
  const supportsAppToolApproval =
    args.capabilities.approval.appToolModes.length > 0;
  const supportsIndexedSearch =
    args.capabilities.webSearchModes.includes("indexed");
  const reviewed = reviewerField
    // Reset a resumed Run thread before ordinary turns can inherit its reviewer.
    ? { ...args.runtimeOptions, codexApprovalsReviewer: args.runtimeOptions.codexApprovalsReviewer ?? "user" }
    : withoutCodexAutoReview(args.runtimeOptions, false);
  return {
    ...reviewed,
    ...(!supportsAppToolApproval
      ? { codexAppToolApprovalMode: undefined }
      : {}),
    ...(!supportsIndexedSearch &&
    args.runtimeOptions.codexWebSearch === "indexed"
      ? { codexWebSearch: "cached" as const }
      : {}),
  };
}

/**
 * Whether managed requirements (`configRequirements/read`) leave room for
 * auto-review. Null or missing lists mean no restriction; the legacy reviewer
 * alias is not taken as permission for the value Stave sends.
 */
export function codexRequirementsAllowAutoReview(response: unknown): boolean {
  const requirements = (response as { requirements?: unknown } | null)?.requirements;
  if (!requirements || typeof requirements !== "object") return true;
  const { allowedApprovalsReviewers: reviewers, allowedApprovalPolicies: policies } =
    requirements as { allowedApprovalsReviewers?: unknown; allowedApprovalPolicies?: unknown };
  if (Array.isArray(reviewers) && !reviewers.includes("auto_review")) return false;
  if (Array.isArray(policies) && !policies.includes("on-request")) return false;
  return true;
}

/** Executables whose App Server refused auto-review in this process. */
const autoReviewRejectedExecutables = new Set<string>();

/**
 * The options to retry a `thread/start`, `thread/resume` or `turn/start` with
 * when App Server refused it (a JSON-RPC error) while it asked for
 * auto-review: Auto as it was before auto-review. Null for any other failure,
 * and for a request that did not ask for auto-review, so a retry happens at
 * most once.
 */
export function codexAutoReviewRetryOptions(
  options: ProviderRuntimeOptions | undefined,
  error: unknown,
): ProviderRuntimeOptions | null {
  return options?.codexApprovalsReviewer === "auto_review" && error instanceof CodexAppServerRpcError
    ? withoutCodexAutoReview(options, true)
    : null;
}

/** Later turns on this executable skip auto-review for the rest of the process. */
export function rememberCodexAutoReviewRejected(executablePath: string) {
  autoReviewRejectedExecutables.add(executablePath);
}

/** The reviewer a `thread/start` or `thread/resume` response says is in effect. */
export function isCodexAutoReviewInEffect(reviewer: unknown) {
  // An older server omits the field; only a reported other reviewer counts.
  return reviewer === undefined || reviewer === null ||
    reviewer === "auto_review" || reviewer === "guardian_subagent";
}

const AUTO_REVIEW_NOTICE_KEYS_MAX = 256;
const announcedAutoReviewFallbackKeys = new Set<string>();

/**
 * The notice for a turn that asked for auto-review and runs without it,
 * once per key (an agent run, or a task outside one). A turn without a key
 * always gets it.
 */
export function takeCodexAutoReviewFallbackNotice(args: {
  requested?: ProviderRuntimeOptions;
  effective?: ProviderRuntimeOptions;
  key?: string;
}): { type: "system"; content: string } | null {
  if (args.requested?.codexApprovalsReviewer !== "auto_review" ||
      args.effective?.codexApprovalsReviewer === "auto_review") {
    return null;
  }
  if (args.key) {
    if (announcedAutoReviewFallbackKeys.has(args.key)) return null;
    announcedAutoReviewFallbackKeys.add(args.key);
    if (announcedAutoReviewFallbackKeys.size > AUTO_REVIEW_NOTICE_KEYS_MAX) {
      const oldest = announcedAutoReviewFallbackKeys.values().next().value;
      if (oldest !== undefined) announcedAutoReviewFallbackKeys.delete(oldest);
    }
  }
  return { type: "system", content: i18n.t("agentRuns:permissions.codexAutoReviewUnavailable") };
}

export function downgradeUnsupportedCodexRuntimeOptions(args: {
  executablePath: string;
  runtimeOptions?: ProviderRuntimeOptions;
}): ProviderRuntimeOptions | undefined {
  const options = applyCodexRuntimeCapabilityDowngrades({
    capabilities: getCodexVersionCapabilities(args.executablePath),
    runtimeOptions: args.runtimeOptions,
  });
  return options && autoReviewRejectedExecutables.has(args.executablePath)
    ? withoutCodexAutoReview(options, true)
    : options;
}
