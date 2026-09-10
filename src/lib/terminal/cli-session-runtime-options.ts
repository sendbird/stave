import type {
  ProviderId,
  ProviderRuntimeOptions,
} from "@/lib/providers/provider.types";

/**
 * Every `ProviderId` needs a branch here — see
 * `docs/developer/adding-a-provider.md`.
 */
export function buildCliSessionRuntimeOptions(args: {
  providerId: ProviderId;
  claudeBinaryPath?: string | null;
  codexBinaryPath?: string | null;
  cursorBinaryPath?: string | null;
  kiroBinaryPath?: string | null;
}): ProviderRuntimeOptions | undefined {
  const claudeBinaryPath = args.claudeBinaryPath?.trim();
  const codexBinaryPath = args.codexBinaryPath?.trim();
  const cursorBinaryPath = args.cursorBinaryPath?.trim();
  const kiroBinaryPath = args.kiroBinaryPath?.trim();

  switch (args.providerId) {
    case "claude-code":
      return {
        ...(claudeBinaryPath ? { claudeBinaryPath } : {}),
        // Claude CLI sessions always boot in native auto mode. The host-service
        // downgrades older Claude CLI builds that do not support it.
        claudePermissionMode: "auto",
      };
    case "codex":
      return codexBinaryPath ? { codexBinaryPath } : undefined;
    case "cursor":
      return cursorBinaryPath ? { cursorBinaryPath } : undefined;
    case "kiro":
      return kiroBinaryPath ? { kiroBinaryPath } : undefined;
  }
}
