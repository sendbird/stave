import { formatList } from "@/i18n/format";
import { i18n } from "@/i18n";
import type {
  McpConfigProvider,
  McpServerConfigDraft,
  McpServerConfigMutationPreview,
} from "./mcp-config.types";
import {
  assertKiroSlackOAuthClientId,
  isSlackHostedMcpUrl,
} from "./slack-hosted-mcp";

function formatMcpShareProviderLabel(provider: McpConfigProvider) {
  switch (provider) {
    case "claude-code":
      return "Claude";
    case "codex":
      return "Codex";
    case "cursor":
      return "Cursor";
    case "kiro":
      return "Kiro";
  }
}

export const MCP_SHAREABLE_PROVIDERS = [
  "claude-code",
  "codex",
  "cursor",
  "kiro",
] as const;

const SHARE_REVISION_PREFIX = "share:v1:";

export function normalizeMcpInstallProviders(
  providers: readonly McpConfigProvider[] | undefined,
  fallback: McpConfigProvider,
): McpConfigProvider[] {
  const unique = new Set<McpConfigProvider>();
  for (const provider of providers ?? []) {
    if (MCP_SHAREABLE_PROVIDERS.includes(provider)) {
      unique.add(provider);
    }
  }
  if (unique.size === 0) {
    unique.add(fallback);
  }
  return MCP_SHAREABLE_PROVIDERS.filter((provider) => unique.has(provider));
}

function stripOauthClientId(draft: McpServerConfigDraft): McpServerConfigDraft {
  const next = { ...draft };
  delete next.oauthClientId;
  return next;
}

export function adaptMcpDraftForProvider(
  draft: McpServerConfigDraft,
  provider: McpConfigProvider,
): McpServerConfigDraft {
  if (provider === "codex") {
    if (draft.transport === "sse") {
      throw new Error(i18n.t("providers:mcpConfigForm.codexDoesNotSupportCreatingSSE"));
    }
    return {
      ...stripOauthClientId(draft),
      provider,
      scope: "user",
    };
  }
  if (provider === "cursor") {
    return {
      ...stripOauthClientId(draft),
      provider,
      scope: draft.scope === "local" ? "project" : draft.scope,
    };
  }
  if (provider === "kiro") {
    const next: McpServerConfigDraft = {
      ...draft,
      provider,
      scope: draft.scope === "local" ? "project" : draft.scope,
    };
    if (isSlackHostedMcpUrl(next.url)) {
      next.oauthClientId = assertKiroSlackOAuthClientId(next.oauthClientId);
    }
    return next;
  }
  return {
    ...stripOauthClientId(draft),
    provider,
  };
}

export function resolveMcpShareDestinationScope(args: {
  sourceScope: McpServerConfigDraft["scope"];
  destinationProvider: McpConfigProvider;
}) {
  if (args.destinationProvider === "codex") return "user" as const;
  if (
    (args.destinationProvider === "cursor" ||
      args.destinationProvider === "kiro") &&
    args.sourceScope === "local"
  ) {
    return "project" as const;
  }
  return args.sourceScope;
}

export function describeMcpInstallAdaptation(args: {
  draft: McpServerConfigDraft;
  provider: McpConfigProvider;
}): string[] {
  const warnings: string[] = [];
  if (args.provider === "codex" && args.draft.scope !== "user") {
    warnings.push(
      i18n.t("providers:mcpConfigShare.codexWillReceiveAUserScope"),
    );
  }
  if (args.provider === "codex" && args.draft.transport === "sse") {
    warnings.push(i18n.t("providers:mcpConfigShare.codexCannotReceiveAnSSEServer"));
  }
  if (args.provider === "cursor" && args.draft.scope === "local") {
    warnings.push(
      i18n.t("providers:mcpConfigShare.cursorWillReceiveAProjectScope"),
    );
  }
  if (args.provider === "kiro" && args.draft.scope === "local") {
    warnings.push(
      i18n.t("providers:mcpConfigShare.kiroWillReceiveAProjectScope"),
    );
  }
  if (args.provider === "kiro" && isSlackHostedMcpUrl(args.draft.url)) {
    warnings.push(
      i18n.t("providers:mcpConfigShare.kiroSlackMCPStoresYourSlack"),
    );
  }
  if (args.provider === "cursor" && isSlackHostedMcpUrl(args.draft.url)) {
    warnings.push(
      i18n.t("providers:mcpConfigShare.cursorSlackMCPWritesSlackS"),
    );
  }
  return warnings;
}

export function planMcpSharedInstall(args: {
  draft: McpServerConfigDraft;
  installProviders?: readonly McpConfigProvider[];
}): {
  providers: McpConfigProvider[];
  drafts: McpServerConfigDraft[];
  warnings: string[];
} {
  const providers = normalizeMcpInstallProviders(
    args.installProviders,
    args.draft.provider,
  );
  const drafts: McpServerConfigDraft[] = [];
  const warnings: string[] = [];

  for (const provider of providers) {
    warnings.push(
      ...describeMcpInstallAdaptation({ draft: args.draft, provider }),
    );
    drafts.push(adaptMcpDraftForProvider(args.draft, provider));
  }

  return { providers, drafts, warnings };
}

export function encodeMcpShareRevision(
  revisions: Readonly<Partial<Record<McpConfigProvider, string>>>,
) {
  const parts = MCP_SHAREABLE_PROVIDERS.flatMap((provider) => {
    const revision = revisions[provider]?.trim();
    return revision ? [`${provider}:${revision}`] : [];
  });
  if (parts.length === 0) {
    throw new Error(i18n.t("providers:mcpConfigShare.aSharedMCPInstallRequiresAt"));
  }
  if (parts.length === 1) {
    const only = Object.values(revisions).find((value) => value?.trim());
    return only ?? parts[0]!;
  }
  return `${SHARE_REVISION_PREFIX}${parts.join("|")}`;
}

export function decodeMcpShareRevision(revision: string) {
  const trimmed = revision.trim();
  if (!trimmed.startsWith(SHARE_REVISION_PREFIX)) {
    return null;
  }
  const encoded = trimmed.slice(SHARE_REVISION_PREFIX.length);
  const parsed: Partial<Record<McpConfigProvider, string>> = {};
  for (const part of encoded.split("|")) {
    const separator = part.indexOf(":");
    if (separator < 1) continue;
    const provider = part.slice(0, separator);
    const value = part.slice(separator + 1).trim();
    if (
      (provider === "claude-code" ||
        provider === "codex" ||
        provider === "cursor" ||
        provider === "kiro") &&
      value.length > 0
    ) {
      parsed[provider] = value;
    }
  }
  return Object.keys(parsed).length > 0 ? parsed : null;
}

export function expectedRevisionForProvider(args: {
  provider: McpConfigProvider;
  revision: string;
}) {
  const shared = decodeMcpShareRevision(args.revision);
  if (!shared) {
    return args.revision;
  }
  const matched = shared[args.provider];
  if (!matched) {
    throw new Error(
      i18n.t("providers:mcpConfigShare.theSharedMCPPreviewIsMissing", { value1: formatMcpShareProviderLabel(args.provider) }),
    );
  }
  return matched;
}

export function composeMcpSharePreview(args: {
  operation: McpServerConfigMutationPreview["operation"];
  name: string;
  previews: Array<{
    provider: McpConfigProvider;
    preview: McpServerConfigMutationPreview;
  }>;
  extraWarnings?: string[];
}): McpServerConfigMutationPreview {
  if (args.previews.length === 0) {
    throw new Error(i18n.t("providers:mcpConfigShare.aSharedMCPInstallRequiresAtVariant8c7f4a6a"));
  }
  if (args.previews.length === 1) {
    const only = args.previews[0]!;
    const warnings = [...only.preview.warnings, ...(args.extraWarnings ?? [])];
    if (args.operation === "share") {
      return {
        ...only.preview,
        operation: "share",
        title: i18n.t("providers:mcpConfigShare.shareTo", { value1: args.name, value2: formatMcpShareProviderLabel(only.provider) }),
        warnings,
      };
    }
    return {
      ...only.preview,
      warnings,
    };
  }

  const labels = args.previews.map((entry) =>
    formatMcpShareProviderLabel(entry.provider),
  );
  const titleKey = { share: "providers:mcpOperations.previewShare", create: "providers:mcpOperations.previewCreate", update: "providers:mcpOperations.previewUpdate", delete: "providers:mcpOperations.previewDelete" } as const;

  return {
    operation: args.operation,
    revision: encodeMcpShareRevision(
      Object.fromEntries(
        args.previews.map((entry) => [entry.provider, entry.preview.revision]),
      ),
    ),
    title: i18n.t(titleKey[args.operation], { name: args.name, providers: formatList(labels) }),
    changes: args.previews.flatMap((entry) => {
      const label = formatMcpShareProviderLabel(entry.provider);
      return entry.preview.changes.map((change) => `${label}: ${change}`);
    }),
    warnings: [
      ...args.previews.flatMap((entry) => entry.preview.warnings),
      ...(args.extraWarnings ?? []),
    ],
  };
}

export function summarizeMcpShareResults(args: {
  operation: McpServerConfigMutationPreview["operation"];
  results: Array<{
    provider: McpConfigProvider;
    ok: boolean;
    detail: string;
  }>;
}) {
  const succeeded = args.results.filter((result) => result.ok);
  const failed = args.results.filter((result) => !result.ok);
  const resultKey = { share: "providers:mcpOperations.resultShare", create: "providers:mcpOperations.resultCreate", update: "providers:mcpOperations.resultUpdate", delete: "providers:mcpOperations.resultDelete" } as const;

  if (failed.length === 0) {
    return {
      ok: true,
      detail:
        succeeded.length > 1
          ? i18n.t(resultKey[args.operation], { providers: formatList(succeeded.map((result) => formatMcpShareProviderLabel(result.provider))) })
          : (succeeded[0]?.detail ?? i18n.t(resultKey[args.operation], { providers: formatList(succeeded.map((result) => formatMcpShareProviderLabel(result.provider))) })),
    };
  }

  if (succeeded.length === 0) {
    return {
      ok: false,
      detail: failed.map((result) => result.detail).join(" "),
    };
  }

  return {
    ok: false,
    detail: i18n.t("providers:mcpConfigShare.partialMCPUpdateSucceeded", { value1: formatList(succeeded.map((result) => formatMcpShareProviderLabel(result.provider))), value2: failed
      .map(
        (result) =>
          i18n.t("providers:mcpOperations.failed", { provider: formatMcpShareProviderLabel(result.provider), detail: result.detail }),
      )
      .join(" ") }),
  };
}
