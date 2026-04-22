import type { ProviderRuntimeOptions } from "@/lib/providers/provider.types";

export type CodexApprovalPolicy = NonNullable<ProviderRuntimeOptions["codexApprovalPolicy"]>;
export type CodexFileAccessMode = NonNullable<ProviderRuntimeOptions["codexFileAccess"]>;

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
