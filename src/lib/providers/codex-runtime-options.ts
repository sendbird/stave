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
