/**
 * Normalizes untyped Codex app-server responses into Stave's snapshot contracts.
 *
 * Extracted verbatim from `codex-app-server-runtime.ts` to keep that file within
 * the max-lines ratchet; no behavior changed. `codex-app-server-runtime` still
 * re-exports `toCodexConfigLayerDisplayValue` for existing consumers.
 */
import type {
  CodexConfigLayerSnapshot,
  CodexConfigOriginSnapshot,
  CodexConfigSnapshot,
  CodexHookCatalogGroup,
  CodexMcpServerStatusSnapshot,
  CodexModelCatalogEntry,
  CodexPluginDetailSnapshot,
  CodexPluginSummarySnapshot,
  CodexRateLimitSnapshot,
  CodexSkillCatalogGroup,
  CodexThreadSnapshot,
} from "../../src/lib/providers/provider.types";
import { toText } from "./utils";
import {
  sanitizeMcpDiagnosticText,
  sanitizeMcpUrl,
} from "./mcp-config-management-shared";

export function mapCodexSkillCatalogGroups(
  data: unknown,
  fallbackCwd: string,
): CodexSkillCatalogGroup[] {
  return Array.isArray(data)
    ? data.map((entry: any) => ({
        cwd: String(entry?.cwd ?? fallbackCwd),
        skills: Array.isArray(entry?.skills)
          ? entry.skills.map((skill: any) => ({
              name: String(skill?.name ?? ""),
              description: String(skill?.description ?? ""),
              shortDescription:
                typeof skill?.shortDescription === "string"
                  ? skill.shortDescription
                  : typeof skill?.interface?.short_description === "string"
                    ? skill.interface.short_description
                    : null,
              path: String(skill?.path ?? ""),
              scope: typeof skill?.scope === "string" ? skill.scope : "unknown",
              enabled: Boolean(skill?.enabled),
            }))
          : [],
        errors: Array.isArray(entry?.errors)
          ? entry.errors.map((error: any) =>
              typeof error?.message === "string"
                ? error.message
                : JSON.stringify(error ?? {}),
            )
          : [],
      }))
    : [];
}

export function mapCodexHookCatalogGroups(
  data: unknown,
  fallbackCwd: string,
): CodexHookCatalogGroup[] {
  return Array.isArray(data)
    ? data.map((entry: any) => ({
        cwd: String(entry?.cwd ?? fallbackCwd),
        hooks: Array.isArray(entry?.hooks)
          ? entry.hooks.map((hook: any) => ({
              key: String(hook?.key ?? ""),
              eventName: String(hook?.eventName ?? "unknown"),
              handlerType: String(hook?.handlerType ?? "unknown"),
              enabled: Boolean(hook?.enabled),
              source: String(hook?.source ?? "unknown"),
              sourcePath: String(hook?.sourcePath ?? ""),
              trustStatus: String(hook?.trustStatus ?? "unknown"),
              isManaged: Boolean(hook?.isManaged),
              statusMessage:
                typeof hook?.statusMessage === "string"
                  ? hook.statusMessage
                  : null,
            }))
          : [],
        errors: Array.isArray(entry?.errors)
          ? entry.errors.map((error: any) =>
              [error?.path, error?.message]
                .filter((value) => typeof value === "string" && value.trim())
                .join(": "),
            )
          : [],
        warnings: Array.isArray(entry?.warnings)
          ? entry.warnings.map((warning: unknown) => String(warning ?? ""))
          : [],
      }))
    : [];
}

function toCodexStatusLabel(status: unknown) {
  if (!status || typeof status !== "object") {
    return "unknown";
  }
  const type = (status as { type?: unknown }).type;
  return typeof type === "string" ? type : "unknown";
}

function toCodexSourceLabel(source: unknown) {
  if (typeof source === "string") {
    return source;
  }
  if (!source || typeof source !== "object") {
    return "unknown";
  }
  const sourceRecord = source as Record<string, unknown>;
  if (typeof sourceRecord.custom === "string") {
    return `custom:${sourceRecord.custom}`;
  }
  const subAgent = sourceRecord.subAgent;
  if (subAgent != null) {
    return `subAgent:${String(subAgent)}`;
  }
  if (typeof sourceRecord.type === "string") {
    const detail = [
      sourceRecord.id,
      sourceRecord.name,
      sourceRecord.label,
    ].find(
      (value) =>
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean",
    );
    return detail == null
      ? sourceRecord.type
      : `${sourceRecord.type}:${String(detail)}`;
  }
  const firstScalarEntry = Object.entries(sourceRecord).find(
    ([, value]) =>
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean",
  );
  if (firstScalarEntry) {
    const [key, value] = firstScalarEntry;
    return `${key}:${String(value)}`;
  }
  return "unknown";
}

export function toCodexConfigLayerDisplayValue(
  value: unknown,
  fallback = "unknown",
): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => toCodexConfigLayerDisplayValue(entry, ""))
      .filter(Boolean);
    return parts.length > 0 ? parts.join(" / ") : fallback;
  }
  if (!value || typeof value !== "object") {
    return fallback;
  }
  const record = value as Record<string, unknown>;
  const pickScalar = (...entries: unknown[]) =>
    entries.find(
      (entry) =>
        (typeof entry === "string" && entry.trim().length > 0) ||
        typeof entry === "number" ||
        typeof entry === "boolean",
    );
  const detail = pickScalar(
    record.displayName,
    record.label,
    record.title,
    record.path,
    record.id,
    record.name,
  );
  const kind = pickScalar(
    record.kind,
    record.type,
    record.scope,
    record.source,
  );
  if (detail != null) {
    const detailLabel =
      typeof detail === "string" ? detail.trim() : String(detail);
    if (kind != null) {
      const kindLabel = typeof kind === "string" ? kind.trim() : String(kind);
      if (kindLabel.length > 0 && kindLabel !== detailLabel) {
        return `${kindLabel}:${detailLabel}`;
      }
    }
    return detailLabel;
  }
  const firstScalarEntry = Object.entries(record).find(
    ([, entry]) =>
      (typeof entry === "string" && entry.trim().length > 0) ||
      typeof entry === "number" ||
      typeof entry === "boolean",
  );
  if (firstScalarEntry) {
    const [key, entry] = firstScalarEntry;
    const entryLabel = typeof entry === "string" ? entry.trim() : String(entry);
    return `${key}:${entryLabel}`;
  }
  const fallbackText = toText(value);
  if (!fallbackText || fallbackText === "{}" || fallbackText === "null") {
    return fallback;
  }
  return fallbackText.length > 180
    ? `${fallbackText.slice(0, 179)}…`
    : fallbackText;
}

export function mapCodexModelCatalogEntry(model: any): CodexModelCatalogEntry {
  return {
    id: String(model?.id ?? model?.model ?? ""),
    model: String(model?.model ?? ""),
    displayName: String(model?.displayName ?? model?.model ?? ""),
    description:
      typeof model?.description === "string" ? model.description : "",
    hidden: Boolean(model?.hidden),
    isDefault: Boolean(model?.isDefault),
    supportsPersonality: Boolean(model?.supportsPersonality),
    defaultReasoningEffort:
      typeof model?.defaultReasoningEffort === "string"
        ? model.defaultReasoningEffort
        : "medium",
    supportedReasoningEfforts: Array.isArray(model?.supportedReasoningEfforts)
      ? model.supportedReasoningEfforts
          .map((entry: any) =>
            typeof entry === "string"
              ? entry
              : typeof entry?.value === "string"
                ? entry.value
                : "",
          )
          .filter(Boolean)
      : [],
    inputModalities: Array.isArray(model?.inputModalities)
      ? model.inputModalities
          .map((entry: unknown) => String(entry ?? "").trim())
          .filter(Boolean)
      : [],
    additionalSpeedTiers: Array.isArray(model?.additionalSpeedTiers)
      ? model.additionalSpeedTiers
          .map((entry: unknown) => String(entry ?? "").trim())
          .filter(Boolean)
      : [],
    upgrade: typeof model?.upgrade === "string" ? model.upgrade : null,
    upgradeInfo:
      model?.upgradeInfo && typeof model.upgradeInfo === "object"
        ? {
            model: String(model.upgradeInfo.model ?? ""),
            upgradeCopy:
              typeof model.upgradeInfo.upgradeCopy === "string"
                ? model.upgradeInfo.upgradeCopy
                : null,
            modelLink:
              typeof model.upgradeInfo.modelLink === "string"
                ? model.upgradeInfo.modelLink
                : null,
            migrationMarkdown:
              typeof model.upgradeInfo.migrationMarkdown === "string"
                ? model.upgradeInfo.migrationMarkdown
                : null,
          }
        : null,
    availabilityNux:
      typeof model?.availabilityNux?.message === "string"
        ? model.availabilityNux.message
        : typeof model?.availabilityNux === "string"
          ? model.availabilityNux
          : null,
  };
}

export function mapCodexMcpStatusSnapshot(
  server: any,
): CodexMcpServerStatusSnapshot {
  const sanitizedUrl = sanitizeMcpUrl(server?.url).value ?? null;
  const tools =
    server?.tools && typeof server.tools === "object"
      ? Object.values(server.tools).map((tool: any) => ({
          name: String(tool?.name ?? ""),
          ...(typeof tool?.title === "string" ? { title: tool.title } : {}),
          ...(typeof tool?.description === "string"
            ? { description: tool.description }
            : {}),
        }))
      : [];
  const resources = Array.isArray(server?.resources)
    ? server.resources.map((resource: any) => ({
        uri: String(resource?.uri ?? ""),
        name: String(resource?.name ?? resource?.title ?? resource?.uri ?? ""),
        ...(typeof resource?.title === "string"
          ? { title: resource.title }
          : {}),
        ...(typeof resource?.description === "string"
          ? { description: resource.description }
          : {}),
        ...(typeof resource?.mimeType === "string"
          ? { mimeType: resource.mimeType }
          : {}),
      }))
    : [];
  const resourceTemplates = Array.isArray(server?.resourceTemplates)
    ? server.resourceTemplates.map((template: any) => ({
        uriTemplate: String(template?.uriTemplate ?? ""),
        name: String(
          template?.name ?? template?.title ?? template?.uriTemplate ?? "",
        ),
        ...(typeof template?.title === "string"
          ? { title: template.title }
          : {}),
        ...(typeof template?.description === "string"
          ? { description: template.description }
          : {}),
        ...(typeof template?.mimeType === "string"
          ? { mimeType: template.mimeType }
          : {}),
      }))
    : [];
  const failureReason =
    typeof server?.failureReason === "string"
      ? server.failureReason
      : undefined;
  const rawConnectionStatus =
    typeof server?.connectionStatus === "string"
      ? server.connectionStatus.toLowerCase()
      : typeof server?.status === "string"
        ? server.status.toLowerCase()
        : "";
  const connectionStatus =
    failureReason?.toLowerCase() === "reauthenticationrequired"
      ? "needs-auth"
      : rawConnectionStatus === "ready" || rawConnectionStatus === "connected"
        ? "connected"
        : rawConnectionStatus === "starting"
          ? "starting"
          : rawConnectionStatus === "failed"
            ? "failed"
            : rawConnectionStatus === "cancelled"
              ? "cancelled"
              : rawConnectionStatus === "disabled"
                ? "disabled"
                : rawConnectionStatus === "needs-auth"
                  ? "needs-auth"
                  : undefined;
  const rawLastError =
    typeof server?.error === "string"
      ? server.error
      : typeof server?.error?.message === "string"
        ? server.error.message
        : undefined;
  const lastError = rawLastError
    ? sanitizeMcpDiagnosticText(rawLastError)
    : undefined;

  return {
    name: String(server?.name ?? ""),
    enabled: true,
    disabledReason: null,
    ...(connectionStatus ? { connectionStatus } : {}),
    ...(lastError ? { lastError } : {}),
    ...(typeof server?.lastErrorAt === "number"
      ? { lastErrorAt: server.lastErrorAt }
      : {}),
    ...(typeof server?.statusUpdatedAt === "number"
      ? { statusUpdatedAt: server.statusUpdatedAt }
      : {}),
    ...(failureReason ? { failureReason } : {}),
    transportType:
      typeof server?.transportType === "string" ? server.transportType : "mcp",
    url: sanitizedUrl,
    bearerTokenEnvVar:
      typeof server?.bearerTokenEnvVar === "string"
        ? server.bearerTokenEnvVar
        : null,
    authStatus:
      typeof server?.authStatus === "string"
        ? server.authStatus
        : typeof server?.authStatus?.type === "string"
          ? server.authStatus.type
          : null,
    startupTimeoutSec:
      typeof server?.startupTimeoutSec === "number"
        ? server.startupTimeoutSec
        : null,
    toolTimeoutSec:
      typeof server?.toolTimeoutSec === "number" ? server.toolTimeoutSec : null,
    ...(tools.length > 0 ? { tools } : {}),
    ...(resources.length > 0 ? { resources } : {}),
    ...(resourceTemplates.length > 0 ? { resourceTemplates } : {}),
  };
}

export function mapCodexPluginSummary(
  plugin: any,
  marketplace: any,
): CodexPluginSummarySnapshot {
  return {
    id: String(plugin?.id ?? ""),
    name: String(plugin?.name ?? ""),
    marketplaceName: String(marketplace?.name ?? ""),
    marketplacePath: String(marketplace?.path ?? ""),
    marketplaceDisplayName:
      typeof marketplace?.interface?.displayName === "string"
        ? marketplace.interface.displayName
        : null,
    source: toCodexSourceLabel(plugin?.source),
    installed: Boolean(plugin?.installed),
    enabled: Boolean(plugin?.enabled),
    installPolicy:
      typeof plugin?.installPolicy === "string"
        ? plugin.installPolicy
        : "unknown",
    authPolicy:
      typeof plugin?.authPolicy === "string" ? plugin.authPolicy : "unknown",
  };
}

export function mapCodexPluginDetail(plugin: any): CodexPluginDetailSnapshot {
  return {
    marketplaceName: String(plugin?.marketplaceName ?? ""),
    marketplacePath: String(plugin?.marketplacePath ?? ""),
    id: String(plugin?.summary?.id ?? ""),
    name: String(plugin?.summary?.name ?? ""),
    source: toCodexSourceLabel(plugin?.summary?.source),
    installed: Boolean(plugin?.summary?.installed),
    enabled: Boolean(plugin?.summary?.enabled),
    installPolicy:
      typeof plugin?.summary?.installPolicy === "string"
        ? plugin.summary.installPolicy
        : "unknown",
    authPolicy:
      typeof plugin?.summary?.authPolicy === "string"
        ? plugin.summary.authPolicy
        : "unknown",
    description:
      typeof plugin?.description === "string" ? plugin.description : null,
    skills: Array.isArray(plugin?.skills)
      ? plugin.skills.map((skill: any) => ({
          name: String(skill?.name ?? ""),
          description: String(skill?.description ?? ""),
          shortDescription:
            typeof skill?.shortDescription === "string"
              ? skill.shortDescription
              : null,
          path: String(skill?.path ?? ""),
          enabled: Boolean(skill?.enabled),
        }))
      : [],
    apps: Array.isArray(plugin?.apps)
      ? plugin.apps.map((app: any) => ({
          id: String(app?.id ?? ""),
          name: String(app?.name ?? ""),
          description:
            typeof app?.description === "string" ? app.description : null,
          installUrl:
            typeof app?.installUrl === "string" ? app.installUrl : null,
          needsAuth: Boolean(app?.needsAuth),
        }))
      : [],
    mcpServers: Array.isArray(plugin?.mcpServers)
      ? plugin.mcpServers
          .map((server: unknown) => String(server ?? "").trim())
          .filter(Boolean)
      : [],
  };
}

export function mapCodexThreadSnapshot(
  thread: any,
  archived: boolean,
): CodexThreadSnapshot {
  return {
    id: String(thread?.id ?? ""),
    forkedFromId:
      typeof thread?.forkedFromId === "string" ? thread.forkedFromId : null,
    preview: typeof thread?.preview === "string" ? thread.preview : "",
    modelProvider:
      typeof thread?.modelProvider === "string"
        ? thread.modelProvider
        : "openai",
    createdAt: typeof thread?.createdAt === "number" ? thread.createdAt : 0,
    updatedAt: typeof thread?.updatedAt === "number" ? thread.updatedAt : 0,
    status: toCodexStatusLabel(thread?.status),
    cwd: typeof thread?.cwd === "string" ? thread.cwd : "",
    cliVersion: typeof thread?.cliVersion === "string" ? thread.cliVersion : "",
    source: toCodexSourceLabel(thread?.source),
    agentNickname:
      typeof thread?.agentNickname === "string" ? thread.agentNickname : null,
    agentRole: typeof thread?.agentRole === "string" ? thread.agentRole : null,
    name: typeof thread?.name === "string" ? thread.name : null,
    archived,
  };
}

export function mapCodexConfigSnapshot(response: any): CodexConfigSnapshot {
  const origins: Record<string, CodexConfigOriginSnapshot> = {};
  if (response?.origins && typeof response.origins === "object") {
    for (const [key, origin] of Object.entries(response.origins)) {
      origins[key] = {
        name: String((origin as any)?.name ?? ""),
        version: String((origin as any)?.version ?? ""),
      };
    }
  }

  return {
    config:
      response?.config && typeof response.config === "object"
        ? (response.config as Record<string, unknown>)
        : {},
    origins,
    layers: Array.isArray(response?.layers)
      ? response.layers.map((layer: any): CodexConfigLayerSnapshot => ({
          name: toCodexConfigLayerDisplayValue(layer?.name),
          version: toCodexConfigLayerDisplayValue(layer?.version, ""),
          disabledReason:
            typeof layer?.disabledReason === "string"
              ? layer.disabledReason
              : null,
          config: layer?.config ?? null,
        }))
      : [],
  };
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Newer Codex plans (e.g. business) report a credit-style `individualLimit`
 * (used/limit as numeric strings + `remainingPercent`) instead of the
 * primary/secondary windows — with those set to null. Normalize it so the
 * status bar has a usable used-percent either way.
 */
function mapCodexIndividualLimit(raw: any) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const used = toFiniteNumber(raw.used);
  const limit = toFiniteNumber(raw.limit);
  const remainingPercent = toFiniteNumber(raw.remainingPercent);
  let usedPercent: number | null = null;
  if (used !== null && limit !== null && limit > 0) {
    usedPercent = (used / limit) * 100;
  } else if (remainingPercent !== null) {
    usedPercent = 100 - remainingPercent;
  }
  if (usedPercent === null) {
    return null;
  }
  return {
    usedPercent,
    used,
    limit,
    resetsAt: typeof raw.resetsAt === "number" ? raw.resetsAt : null,
  };
}

export function mapCodexRateLimitBuckets(
  response: any,
): CodexRateLimitSnapshot[] {
  const buckets =
    response?.rateLimitsByLimitId &&
    typeof response.rateLimitsByLimitId === "object"
      ? Object.values(response.rateLimitsByLimitId)
      : response?.rateLimits
        ? [response.rateLimits]
        : [];
  return buckets.map((bucket: any) => ({
    limitId: typeof bucket?.limitId === "string" ? bucket.limitId : null,
    limitName: typeof bucket?.limitName === "string" ? bucket.limitName : null,
    planType: typeof bucket?.planType === "string" ? bucket.planType : null,
    primary: bucket?.primary
      ? {
          usedPercent:
            typeof bucket.primary.usedPercent === "number"
              ? bucket.primary.usedPercent
              : 0,
          windowDurationMins:
            typeof bucket.primary.windowDurationMins === "number"
              ? bucket.primary.windowDurationMins
              : null,
          resetsAt:
            typeof bucket.primary.resetsAt === "number"
              ? bucket.primary.resetsAt
              : null,
        }
      : null,
    secondary: bucket?.secondary
      ? {
          usedPercent:
            typeof bucket.secondary.usedPercent === "number"
              ? bucket.secondary.usedPercent
              : 0,
          windowDurationMins:
            typeof bucket.secondary.windowDurationMins === "number"
              ? bucket.secondary.windowDurationMins
              : null,
          resetsAt:
            typeof bucket.secondary.resetsAt === "number"
              ? bucket.secondary.resetsAt
              : null,
        }
      : null,
    individualLimit: mapCodexIndividualLimit(bucket?.individualLimit),
    credits: bucket?.credits
      ? {
          hasCredits: Boolean(bucket.credits.hasCredits),
          unlimited: Boolean(bucket.credits.unlimited),
          balance:
            typeof bucket.credits.balance === "string"
              ? bucket.credits.balance
              : null,
        }
      : null,
  }));
}
