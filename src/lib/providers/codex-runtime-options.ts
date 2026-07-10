import type { ProviderRuntimeOptions } from "@/lib/providers/provider.types";

export type CodexApprovalPolicy = NonNullable<ProviderRuntimeOptions["codexApprovalPolicy"]>;
export type CodexFileAccessMode = NonNullable<ProviderRuntimeOptions["codexFileAccess"]>;
export type CodexReasoningEffort = NonNullable<
  ProviderRuntimeOptions["codexReasoningEffort"]
>;

export function resolveEffectiveCodexApprovalPolicy(args: {
  approvalPolicy?: string;
  planMode?: boolean;
  fallback?: CodexApprovalPolicy;
}): CodexApprovalPolicy {
  if (args.planMode) {
    return "never";
  }

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

export function resolveEffectiveCodexFileAccessMode(args: {
  fileAccessMode?: ProviderRuntimeOptions["codexFileAccess"];
  planMode?: boolean;
  fallback?: CodexFileAccessMode;
}): CodexFileAccessMode {
  if (args.planMode) {
    return "read-only";
  }

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
