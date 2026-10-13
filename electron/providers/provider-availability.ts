import { inspectNativeProviderTooling } from "../main/utils/tooling-status";
import { gatewayCredentialAvailable, peekApiConnection } from "../provider-accounts/gateway-runtime";
import { withProviderAccountScope } from "../provider-accounts/runtime-scope";
import { buildClaudeEnv } from "./claude-sdk-runtime";
import { buildCodexCliEnv } from "./cli-path-env";
import { runExecutableProbe } from "./runtime-shared";
import { toolingAllowsProviderReads } from "../../src/lib/providers/provider-readiness";
import { extractRuntimeVersion, resolveProviderRuntimeCapabilities } from "../../src/lib/providers/runtime-capabilities";
import type { ProviderAvailabilityResponse, ProviderRuntimeOptions } from "../../src/lib/providers/provider.types";

export function describeNativeProviderAvailability(args: {
  providerId: "claude-code" | "codex";
  runtimeOptions?: ProviderRuntimeOptions;
}): Promise<ProviderAvailabilityResponse> {
  return withProviderAccountScope(args.runtimeOptions, async () => {
    const tool = await inspectNativeProviderTooling({
      providerId: args.providerId,
      ...args.runtimeOptions,
    });
    // API connections use the saved key rather than CLI sign-in.
    const available = peekApiConnection(args.providerId)
      ? tool.available && gatewayCredentialAvailable(undefined, args.providerId)
      : toolingAllowsProviderReads(tool);
    let versionText = tool.version ?? "";
    if (available && !versionText && tool.executablePath) {
      const probe = await runExecutableProbe({
        executablePath: tool.executablePath,
        commandArgs: ["--version"],
        env: args.providerId === "claude-code"
          ? buildClaudeEnv({ executablePath: tool.executablePath })
          : buildCodexCliEnv({ executablePath: tool.executablePath }),
      });
      versionText = probe.text;
    }
    const version = extractRuntimeVersion(versionText);
    return {
      ok: true,
      providerId: args.providerId,
      available,
      toolingStatus: tool,
      detail: tool.summary,
      ...(version ? { version } : {}),
      capabilities: resolveProviderRuntimeCapabilities({
        providerId: args.providerId,
        versionText,
        available,
      }),
    };
  });
}
