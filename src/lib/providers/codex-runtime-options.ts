import type { ProviderRuntimeOptions } from "@/lib/providers/provider.types";

export type CodexApprovalPolicy = NonNullable<ProviderRuntimeOptions["codexApprovalPolicy"]>;
export type CodexFileAccessMode = NonNullable<ProviderRuntimeOptions["codexFileAccess"]>;
export type CodexReasoningEffort = NonNullable<
  ProviderRuntimeOptions["codexReasoningEffort"]
>;

export function resolveEffectiveCodexApprovalPolicy(args: {
  approvalPolicy?: string;
  fallback?: CodexApprovalPolicy;
}): CodexApprovalPolicy {
  if (
    args.approvalPolicy === "never"
    || args.approvalPolicy === "on-request"
    || args.approvalPolicy === "on-failure"
    || args.approvalPolicy === "untrusted"
  ) {
    return args.approvalPolicy;
  }

  return args.fallback ?? "untrusted";
}

export function resolveCodexApprovalsReviewer(
  reviewer?: string,
): ProviderRuntimeOptions["codexApprovalsReviewer"] {
  return reviewer === "user" || reviewer === "auto_review" ? reviewer : undefined;
}

export function resolveEffectiveCodexFileAccessMode(args: {
  fileAccessMode?: ProviderRuntimeOptions["codexFileAccess"];
  fallback?: CodexFileAccessMode;
}): CodexFileAccessMode {
  if (
    args.fileAccessMode === "read-only"
    || args.fileAccessMode === "workspace-write"
    || args.fileAccessMode === "danger-full-access"
  ) {
    return args.fileAccessMode;
  }

  return args.fallback ?? "workspace-write";
}

export function resolveCodexAppServerReasoningEffort(args: {
  reasoningEffort?: ProviderRuntimeOptions["codexReasoningEffort"];
}): CodexReasoningEffort | undefined {
  if (
    args.reasoningEffort !== "minimal" &&
    args.reasoningEffort !== "low" &&
    args.reasoningEffort !== "medium" &&
    args.reasoningEffort !== "high" &&
    args.reasoningEffort !== "xhigh" &&
    args.reasoningEffort !== "max" &&
    args.reasoningEffort !== "ultra"
  ) {
    return undefined;
  }

  // Current Codex App Server exposes built-in tools such as image_gen and
  // web_search on ordinary turns, and the upstream model API rejects those
  // tools when reasoning.effort is "minimal".
  return args.reasoningEffort === "minimal" ? "low" : args.reasoningEffort;
}

/**
 * Run Auto without Codex's reviewer: the turn policy already set every other
 * field of an autonomous Codex turn (file access floor, Stave's prompt-free
 * tools), so swapping `on-request` back to `never` restores exactly the Auto
 * behavior from before native auto-review. `reviewerField` says whether the
 * runtime accepts `approvalsReviewer`; when it does, the thread is reset to
 * `user` explicitly so it cannot keep a reviewer from an earlier turn.
 */
export function withoutCodexAutoReview(
  options: ProviderRuntimeOptions,
  reviewerField: boolean,
): ProviderRuntimeOptions {
  if (options.codexApprovalsReviewer !== "auto_review") {
    return reviewerField ? options : { ...options, codexApprovalsReviewer: undefined };
  }
  return {
    ...options,
    codexApprovalsReviewer: reviewerField ? "user" : undefined,
    ...(options.codexApprovalPolicy === "on-request"
      ? { codexApprovalPolicy: "never" as const }
      : {}),
  };
}

export const CODEX_APPROVAL_POLICIES = ["never", "on-request", "on-failure", "untrusted"] as const;
export const CODEX_APPROVALS_REVIEWERS = ["user", "auto_review"] as const;

/**
 * The normalized provider event for the approvals a Codex turn runs with,
 * after the runtime's own checks (the executable, a managed policy, the
 * reviewer the thread reports). Sent for a turn that asked for Codex's
 * reviewer, where those checks can turn it off; Stave records it on the
 * turn's agent provenance, so a run can say what actually applied.
 */
export interface CodexApprovalsAppliedEvent {
  type: "approvals_applied";
  codexApprovalPolicy: (typeof CODEX_APPROVAL_POLICIES)[number];
  codexApprovalsReviewer?: (typeof CODEX_APPROVALS_REVIEWERS)[number];
}

/** The event for a turn that asked for the reviewer, from what it asked for and what it runs with; null otherwise. */
export function buildCodexApprovalsAppliedEvent(args: {
  requested?: ProviderRuntimeOptions;
  effective?: ProviderRuntimeOptions;
}): CodexApprovalsAppliedEvent | null {
  if (args.requested?.codexApprovalsReviewer !== "auto_review") return null;
  return {
    type: "approvals_applied",
    codexApprovalPolicy: args.effective?.codexApprovalPolicy ?? "never",
    ...(args.effective?.codexApprovalsReviewer ? { codexApprovalsReviewer: args.effective.codexApprovalsReviewer } : {}),
  };
}
