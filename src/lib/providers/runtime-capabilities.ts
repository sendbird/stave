import type {
  ProviderId,
  ProviderRuntimeCapabilities,
} from "@/lib/providers/provider.types";

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
}

function parseVersion(value?: string | null): ParsedVersion | null {
  const match = value?.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function isAtLeast(version: ParsedVersion | null, minimum: ParsedVersion) {
  if (!version) {
    return false;
  }
  if (version.major !== minimum.major) {
    return version.major > minimum.major;
  }
  if (version.minor !== minimum.minor) {
    return version.minor > minimum.minor;
  }
  return version.patch >= minimum.patch;
}

export function createEmptyProviderRuntimeCapabilities(): ProviderRuntimeCapabilities {
  return {
    approval: {
      appToolModes: [],
      autoClassifierPolicy: false,
      permissionProfiles: false,
    },
    sandbox: {
      credentialGuards: false,
    },
    history: {
      forkBoundary: null,
      rewind: {
        files: false,
        conversation: false,
      },
    },
    hooks: {
      lifecycleEvents: false,
      inventory: false,
      trustManagement: false,
    },
    delegationPolicies: [],
    webSearchModes: [],
  };
}

/**
 * Resolve only capabilities implemented by Stave. Unknown and older runtime
 * versions fail closed so unsupported fields are never sent speculatively.
 */
export function resolveProviderRuntimeCapabilities(args: {
  providerId: ProviderId;
  versionText?: string | null;
  available?: boolean;
}): ProviderRuntimeCapabilities {
  if (args.available === false) {
    return createEmptyProviderRuntimeCapabilities();
  }

  const version = parseVersion(args.versionText);
  if (args.providerId === "claude-code") {
    const hasSdkMutationSurface = isAtLeast(version, {
      major: 2,
      minor: 1,
      patch: 179,
    });
    return {
      ...createEmptyProviderRuntimeCapabilities(),
      approval: {
        appToolModes: [],
        autoClassifierPolicy: false,
        permissionProfiles: false,
      },
      sandbox: {
        credentialGuards: isAtLeast(version, {
          major: 2,
          minor: 1,
          patch: 187,
        }),
      },
      history: {
        forkBoundary: hasSdkMutationSurface ? "message" : null,
        rewind: {
          files: hasSdkMutationSurface,
          conversation: false,
        },
      },
      hooks: {
        lifecycleEvents: hasSdkMutationSurface,
        inventory: false,
        trustManagement: false,
      },
    };
  }

  const hasTurnFork = isAtLeast(version, {
    major: 0,
    minor: 117,
    patch: 0,
  });
  const hasStableHooks = isAtLeast(version, {
    major: 0,
    minor: 124,
    patch: 0,
  });
  const hasH1AppControls = isAtLeast(version, {
    major: 0,
    minor: 142,
    patch: 0,
  });

  return {
    ...createEmptyProviderRuntimeCapabilities(),
    approval: {
      appToolModes: hasH1AppControls
        ? ["auto", "prompt", "writes", "approve"]
        : [],
      autoClassifierPolicy: false,
      permissionProfiles: false,
    },
    history: {
      forkBoundary: hasTurnFork ? "turn" : "thread",
      rewind: {
        files: false,
        conversation: false,
      },
    },
    hooks: {
      lifecycleEvents: hasStableHooks,
      inventory: hasStableHooks,
      trustManagement: false,
    },
    webSearchModes: hasH1AppControls
      ? ["disabled", "cached", "live", "indexed"]
      : ["disabled", "cached", "live"],
  };
}

export function extractRuntimeVersion(versionText?: string | null) {
  return versionText?.match(/\d+\.\d+\.\d+/)?.[0];
}

export function createDefaultProviderRuntimeCapabilities(): Record<
  ProviderId,
  ProviderRuntimeCapabilities
> {
  return {
    "claude-code": createEmptyProviderRuntimeCapabilities(),
    codex: createEmptyProviderRuntimeCapabilities(),
  };
}
