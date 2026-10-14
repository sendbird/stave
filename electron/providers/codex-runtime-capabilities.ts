import { i18n } from "../../src/i18n/runtime";
import type {
  ProviderRuntimeCapabilities,
  ProviderRuntimeOptions,
} from "../../src/lib/providers/provider.types";
import { resolveProviderRuntimeCapabilities } from "../../src/lib/providers/runtime-capabilities";
import { buildCodexCliEnv } from "./cli-path-env";
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

export function applyCodexRuntimeCapabilityDowngrades(args: {
  capabilities: ProviderRuntimeCapabilities;
  runtimeOptions?: ProviderRuntimeOptions;
}): ProviderRuntimeOptions | undefined {
  if (!args.runtimeOptions) {
    return args.capabilities.approval.autoClassifierPolicy
      ? { codexApprovalsReviewer: "user" }
      : undefined;
  }
  const supportsAppToolApproval =
    args.capabilities.approval.appToolModes.length > 0;
  const supportsIndexedSearch =
    args.capabilities.webSearchModes.includes("indexed");
  return {
    ...args.runtimeOptions,
    ...(args.capabilities.approval.autoClassifierPolicy
      // Reset a resumed Run thread before ordinary turns can inherit its reviewer.
      ? { codexApprovalsReviewer: args.runtimeOptions.codexApprovalsReviewer ?? "user" }
      : { codexApprovalsReviewer: undefined,
          ...(args.runtimeOptions.codexApprovalsReviewer === "auto_review" &&
              args.runtimeOptions.codexApprovalPolicy === "on-request"
            ? { codexApprovalPolicy: "never" as const } : {}) }),
    ...(!supportsAppToolApproval
      ? { codexAppToolApprovalMode: undefined }
      : {}),
    ...(!supportsIndexedSearch &&
    args.runtimeOptions.codexWebSearch === "indexed"
      ? { codexWebSearch: "cached" as const }
      : {}),
  };
}

export function buildCodexAutoReviewUnavailableNotice(args: {
  capabilities: ProviderRuntimeCapabilities;
  runtimeOptions?: ProviderRuntimeOptions;
}) {
  return args.runtimeOptions?.codexApprovalsReviewer === "auto_review" &&
    !args.capabilities.approval.autoClassifierPolicy
    ? { type: "system" as const, content: i18n.t("agentRuns:permissions.codexAutoReviewUnavailable") }
    : null;
}

export function downgradeUnsupportedCodexRuntimeOptions(args: {
  executablePath: string;
  runtimeOptions?: ProviderRuntimeOptions;
}): ProviderRuntimeOptions | undefined {
  return applyCodexRuntimeCapabilityDowngrades({
    capabilities: getCodexVersionCapabilities(args.executablePath),
    runtimeOptions: args.runtimeOptions,
  });
}
