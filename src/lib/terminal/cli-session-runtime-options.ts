import type { ProviderRuntimeOptions } from "@/lib/providers/provider.types";

type CliSessionProviderId = "claude-code" | "codex";

export function buildCliSessionRuntimeOptions(args: {
  providerId: CliSessionProviderId;
  claudeBinaryPath?: string | null;
  codexBinaryPath?: string | null;
}): ProviderRuntimeOptions | undefined {
  const claudeBinaryPath = args.claudeBinaryPath?.trim();
  const codexBinaryPath = args.codexBinaryPath?.trim();

  if (args.providerId === "claude-code") {
    return {
      ...(claudeBinaryPath ? { claudeBinaryPath } : {}),
      // Claude CLI sessions always boot in native auto mode. The host-service
      // downgrades older Claude CLI builds that do not support it.
      claudePermissionMode: "auto",
    };
  }

  return codexBinaryPath ? { codexBinaryPath } : undefined;
}
