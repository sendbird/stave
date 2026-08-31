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
    workGraph: {
      agentIdentity: false,
      nesting: false,
      message: false,
      interrupt: false,
      stop: false,
    },
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

  if (args.providerId === "cursor" || args.providerId === "kiro") {
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
      workGraph: {
        // `agent_id` reaches Stave only through hook lifecycle metadata, so it
        // rides the same version marker as the hook surface itself.
        agentIdentity: hasSdkMutationSurface,
        // `parent_tool_use_id` is a field on the base message shape rather than
        // a gated surface, so any recognized 2.x runtime reports nesting.
        nesting: isAtLeast(version, { major: 2, minor: 0, patch: 0 }),
        // A message or an interrupt lands on the whole session: the SDK's
        // input stream is the session's, not any one subagent's.
        message: false,
        interrupt: false,
        // The SDK *does* expose `Query.stopTask(taskId)`, keyed by the same
        // `task_id` the work graph uses as this provider's agent identity. It
        // is reported `false` because this flag means "wired end-to-end", and
        // reaching that query handle from the renderer needs a control channel
        // Stave has not built. Claiming it before then would render a Stop that
        // silently does nothing.
        stop: false,
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
    workGraph: {
      // Child threads carry their own `agentThreadId`, which is a real agent
      // identity and arrives with the same app-server surface as the other H1
      // controls.
      agentIdentity: hasH1AppControls,
      // `subAgentActivity` names the spawning tool call, so the parent edge is
      // reported rather than inferred.
      nesting: hasH1AppControls,
      // The app server accepts no per-child-thread steering command today.
      message: false,
      interrupt: false,
      stop: false,
    },
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
    cursor: createEmptyProviderRuntimeCapabilities(),
    kiro: createEmptyProviderRuntimeCapabilities(),
  };
}
