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
    return undefined;
  }
  const supportsAppToolApproval =
    args.capabilities.approval.appToolModes.length > 0;
  const supportsIndexedSearch =
    args.capabilities.webSearchModes.includes("indexed");
  return {
    ...args.runtimeOptions,
    ...(!supportsAppToolApproval
      ? { codexAppToolApprovalMode: undefined }
      : {}),
    ...(!supportsIndexedSearch &&
    args.runtimeOptions.codexWebSearch === "indexed"
      ? { codexWebSearch: "cached" as const }
      : {}),
  };
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
