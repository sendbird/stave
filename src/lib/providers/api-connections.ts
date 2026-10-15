import { i18n } from "@/i18n/runtime";
import { z } from "zod";

/**
 * An API connection is one gateway key billed per token, shared by the Claude
 * Code and Codex runtimes. Each runtime it serves gets its own endpoint and an
 * adapter in Electron main; the key itself stays in Settings > Secrets and only
 * its reference (`secretId`) is stored or crosses IPC.
 */
export const API_CONNECTION_RUNTIMES = ["claude-code", "codex"] as const;
export type ApiConnectionRuntime = (typeof API_CONNECTION_RUNTIMES)[number];
export const MAX_API_CONNECTIONS = 20;
export const MAX_API_CONNECTION_MODELS = 50;

/** Vercel AI Gateway endpoints, from vercel.com/docs/ai-gateway (checked 2026-10-02). */
export const VERCEL_AI_GATEWAY = {
  get label() { return /* i18n-ignore: external service name */ "Vercel AI Gateway"; },
  endpoints: {
    // No `/v1`: the Anthropic SDK appends `/v1/messages` itself.
    "claude-code": "https://ai-gateway.vercel.sh/claude-code",
    codex: "https://ai-gateway.vercel.sh/codex/v1",
  },
  /** Public catalog; no key required. */
  modelsUrl: "https://ai-gateway.vercel.sh/v1/models",
  /** Authenticated; proves the key without running inference. */
  creditsUrl: "https://ai-gateway.vercel.sh/v1/credits",
} as const;

export const ApiConnectionKindSchema = z.enum(["vercel-ai-gateway", "custom"]);
export type ApiConnectionKind = z.infer<typeof ApiConnectionKindSchema>;

/**
 * Gateway model IDs: `creator/model` (`moonshotai/kimi-k3`), a bare Claude ID
 * (`claude-sonnet-5`), or a Claude Code picker ID with its display-only
 * `claude-code/` prefix and `[1m]` marker. They travel as CLI arguments and
 * environment values, so the character set stays narrow. It accepts every ID
 * the Claude-only schema of earlier builds accepted.
 */
export const ApiConnectionModelIdSchema = z.string().trim().min(1).max(200)
  .regex(/^(?:claude-code\/)?[a-z0-9][a-z0-9._:[\]-]*(?:\/[a-z0-9][a-z0-9._:[\]-]*)?$/i);

const PriceSchema = z.string().trim().max(32).regex(/^\d+(?:\.\d+)?(?:e-?\d+)?$/i);
export const ApiConnectionModelSchema = z.object({
  id: ApiConnectionModelIdSchema,
  name: z.string().trim().min(1).max(200).regex(/^[^\u0000-\u001f\u007f]+$/).optional(),
  contextWindow: z.number().int().positive().max(100_000_000).optional(),
  /** USD per token as the gateway lists it, for example "0.000002". */
  inputPrice: PriceSchema.optional(),
  outputPrice: PriceSchema.optional(),
}).strict();
export type ApiConnectionModel = z.infer<typeof ApiConnectionModelSchema>;

export const HttpsBaseUrlSchema = z.string().trim().max(2048).url().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}, { error: () => i18n.t("providers:validation.httpsUrl") })
  .transform((value) => value.replace(/\/+$/, ""));

export const ApiConnectionEndpointsSchema = z.object({
  "claude-code": HttpsBaseUrlSchema.optional(),
  codex: HttpsBaseUrlSchema.optional(),
}).strict().refine((value) => Boolean(value["claude-code"] || value.codex), { error: () => i18n.t("providers:validation.endpoint") });
export type ApiConnectionEndpoints = z.infer<typeof ApiConnectionEndpointsSchema>;

const LabelSchema = z.string().trim().min(1).max(100).regex(/^[^\u0000-\u001f\u007f]+$/);
const ModelListSchema = z.array(ApiConnectionModelSchema).min(1).max(MAX_API_CONNECTION_MODELS)
  .refine((models) => new Set(models.map((model) => model.id)).size === models.length, { error: () => i18n.t("providers:validation.uniqueModels") });

export const ApiConnectionSchema = z.object({
  id: z.uuid(),
  label: LabelSchema,
  kind: ApiConnectionKindSchema,
  secretId: z.uuid(),
  endpoints: ApiConnectionEndpointsSchema,
  /** Pinned shortlist, in the order the user chose; shared by every runtime. */
  models: ModelListSchema,
}).strict();
export type ApiConnection = z.infer<typeof ApiConnectionSchema>;

export const ApiConnectionCreateArgsSchema = z.object({
  label: LabelSchema,
  kind: ApiConnectionKindSchema,
  secretId: z.uuid(),
  /** Required for `custom`; the Vercel preset derives both endpoints. */
  endpoints: ApiConnectionEndpointsSchema.optional(),
  models: ModelListSchema,
}).strict().refine((args) => args.kind !== "custom" || Boolean(args.endpoints), { error: () => i18n.t("providers:validation.customEndpoint") });
export type ApiConnectionCreateArgs = z.infer<typeof ApiConnectionCreateArgsSchema>;

/** Where a connection sends turns is fixed; name, key reference and models can change. */
export const ApiConnectionUpdateArgsSchema = z.object({
  id: z.uuid(),
  label: LabelSchema.optional(),
  secretId: z.uuid().optional(),
  models: ModelListSchema.optional(),
}).strict();
export type ApiConnectionUpdateArgs = z.infer<typeof ApiConnectionUpdateArgsSchema>;

export const ApiConnectionIdArgsSchema = z.object({ id: z.uuid() }).strict();
export type ApiConnectionIdArgs = z.infer<typeof ApiConnectionIdArgsSchema>;

export type ApiConnectionListResult =
  | { ok: true; connections: ApiConnection[] }
  | { ok: false; connections: []; message: string };
export type ApiConnectionSaveResult =
  | { ok: true; connection: ApiConnection }
  | { ok: false; message: string };
export type ApiConnectionRemoveResult = { ok: boolean; message?: string };

/**
 * What a check found. `unreachable`, `timeout` and `certificate-untrusted`
 * come from the request itself (no answer, no answer in time, or a TLS
 * certificate Node does not trust, as behind an inspecting proxy); the rest
 * come from the gateway's answer or the stored key.
 */
export type ApiConnectionCheckStatus =
  | "ok"
  | "invalid-key"
  | "budget-exhausted"
  | "rate-limited"
  | "models-missing"
  | "missing-key"
  | "unreachable"
  | "timeout"
  | "certificate-untrusted"
  | "unexpected";
export interface ApiConnectionCheckResult {
  ok: boolean;
  status: ApiConnectionCheckStatus;
  message: string;
  /** Pinned IDs the gateway does not list; empty when the list was not read. */
  missingModels: string[];
}

/** One discoverable model, as the settings picker shows it. */
export interface ApiConnectionCatalogModel extends ApiConnectionModel {
  name: string;
  tags: string[];
}
/** Why the model list could not be read; the renderer picks the words. */
export type ApiConnectionCatalogFailure = ApiConnectionRequestFailure | "rate-limited" | "unexpected";
export type ApiConnectionCatalogResult =
  | { ok: true; models: ApiConnectionCatalogModel[] }
  | { ok: false; models: []; message: string; reason?: ApiConnectionCatalogFailure };

export interface ApiConnectionsBridgeApi {
  list: () => Promise<ApiConnectionListResult>;
  create: (args: ApiConnectionCreateArgs) => Promise<ApiConnectionSaveResult>;
  update: (args: ApiConnectionUpdateArgs) => Promise<ApiConnectionSaveResult>;
  remove: (args: ApiConnectionIdArgs) => Promise<ApiConnectionRemoveResult>;
  /** Key validity and pinned-model listing. Never sends a prompt. */
  check: (args: ApiConnectionIdArgs) => Promise<ApiConnectionCheckResult>;
  /** The Vercel AI Gateway public catalog, filtered to coding-capable models. */
  discoverModels: (args?: { purpose: "coding" | "decision" }) => Promise<ApiConnectionCatalogResult>;
}

export const API_CONNECTION_IPC = {
  list: "api-connections:list",
  create: "api-connections:create",
  update: "api-connections:update",
  remove: "api-connections:remove",
  check: "api-connections:check",
  discoverModels: "api-connections:discover-models",
} as const;

/** The routing form of a model ID: picker prefix and context marker removed. */
export function apiConnectionRoutingModelId(id: string) {
  return id.trim().replace(/^claude-code\//, "").replace(/\[1m\]$/i, "");
}

/** Known native identifiers retain their capabilities when a gateway adds a creator prefix. */
export function canonicalApiConnectionModelId(id: string) {
  return id.trim().replace(/^claude-code\//, "").replace(/^(?:anthropic|openai)\//, "")
    .replace(/^(claude-(?:haiku|sonnet|opus|fable)-\d+)\.(\d+)/, "$1-$2");
}

/** Claude models are the only ones Anthropic supports through a gateway. */
export function isClaudeModelId(id: string) {
  return /^(?:anthropic\/)?claude-/i.test(apiConnectionRoutingModelId(id));
}

/** Codex reads metadata natively for OpenAI models only. */
export function isOpenAiModelId(id: string) {
  return /^openai\//i.test(apiConnectionRoutingModelId(id));
}

export const CLAUDE_CODE_EXPERIMENTAL_MODEL_LABEL_KEY = "providers:apiConnections.experimentalLabel" as const;
export const CLAUDE_CODE_EXPERIMENTAL_MODEL_REASON_KEY = "providers:apiConnections.experimentalReason" as const;

export function isExperimentalApiConnectionModel(runtime: ApiConnectionRuntime, id: string) {
  return runtime === "claude-code" && !isClaudeModelId(id);
}

/**
 * The model a runtime uses when none is chosen, and for Claude Code's
 * background requests and subagent aliases: the first pinned model each
 * runtime reads natively, else the first pinned model.
 */
export function apiConnectionDefaultModel(runtime: ApiConnectionRuntime, models: readonly { id: string }[]) {
  const native = models.find((model) => (runtime === "claude-code" ? isClaudeModelId(model.id) : isOpenAiModelId(model.id)));
  return (native ?? models[0])?.id;
}

export function apiConnectionEndpoints(kind: ApiConnectionKind, endpoints?: ApiConnectionEndpoints): ApiConnectionEndpoints {
  return kind === "vercel-ai-gateway" ? { ...VERCEL_AI_GATEWAY.endpoints } : { ...endpoints };
}

export function apiConnectionRuntimes(connection: Pick<ApiConnection, "endpoints">) {
  return API_CONNECTION_RUNTIMES.filter((runtime) => Boolean(connection.endpoints[runtime]));
}

export function apiConnectionGroupLabel(label: string) {
  return i18n.t("providers:apiConnections.apiBilling", { value1: label });
}

export type ApiConnectionHttpStatus = Exclude<ApiConnectionCheckStatus, "ok" | "models-missing" | "missing-key" | ApiConnectionRequestFailure>;

/** A request that got no usable answer: no route, no answer in time, or an untrusted certificate. */
export type ApiConnectionRequestFailure = "unreachable" | "timeout" | "certificate-untrusted";

/**
 * TLS verification failures Node reports when a proxy re-signs traffic with a
 * certificate the bundled roots do not include, plus expired or mismatched
 * certificates. Electron's network stack reports the same as `net::ERR_CERT_*`.
 */
const CERTIFICATE_ERROR_CODES = new Set([
  "UNABLE_TO_GET_ISSUER_CERT", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT", "CERT_UNTRUSTED", "CERT_REJECTED",
  "CERT_HAS_EXPIRED", "CERT_NOT_YET_VALID", "CERT_SIGNATURE_FAILURE", "UNABLE_TO_DECRYPT_CERT_SIGNATURE",
  "ERR_TLS_CERT_ALTNAME_INVALID", "HOSTNAME_MISMATCH",
]);
const TIMEOUT_ERROR_CODES = new Set([
  "ETIMEDOUT", "ESOCKETTIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT",
]);

/**
 * Classifies a thrown request error by its code, walking `cause` (undici puts
 * the socket error there). Only codes and names are read; the message and any
 * header or key never leave this function. Null for errors that are not about
 * the request, such as a body that failed to parse.
 */
export function classifyApiConnectionRequestError(error: unknown): ApiConnectionRequestFailure | null {
  let current: unknown = error;
  let request = false;
  for (let depth = 0; depth < 6 && current && typeof current === "object"; depth += 1) {
    const { name, code, message } = current as { name?: unknown; code?: unknown; message?: unknown };
    if (name === "TimeoutError") return "timeout";
    if (typeof code === "string") {
      if (CERTIFICATE_ERROR_CODES.has(code)) return "certificate-untrusted";
      if (TIMEOUT_ERROR_CODES.has(code)) return "timeout";
      request = true;
    }
    if (typeof message === "string") {
      if (/net::ERR_CERT_|ERR_SSL_|certificate/i.test(message)) return "certificate-untrusted";
      if (/net::ERR_TIMED_OUT|net::ERR_CONNECTION_TIMED_OUT/.test(message)) return "timeout";
      if (/^net::ERR_|fetch failed|failed to fetch/i.test(message)) request = true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return request ? "unreachable" : null;
}

/** What a gateway's HTTP refusal means for the person holding the key. */
export function classifyApiConnectionHttpStatus(status: number): ApiConnectionHttpStatus {
  if (status === 401 || status === 403) return "invalid-key";
  if (status === 402) return "budget-exhausted";
  if (status === 429) return "rate-limited";
  return "unexpected";
}

export function describeApiConnectionHttpStatus(status: number) {
  switch (classifyApiConnectionHttpStatus(status)) {
    case "invalid-key":
      return i18n.t("providers:apiConnections.theGatewayRejectedTheKeyHTTP", { value1: status });
    case "budget-exhausted":
      return i18n.t("providers:apiConnections.thisKeySBudgetOnThe");
    case "rate-limited":
      return i18n.t("providers:apiConnections.theGatewaySRateLimitOr");
    default:
      return i18n.t("providers:apiConnections.theGatewayAnsweredWithHTTPCheck", { value1: status });
  }
}

/** "$2 / $10 per 1M tokens" from per-token prices; empty when either is unknown. */
export function formatApiConnectionPrice(model: Pick<ApiConnectionModel, "inputPrice" | "outputPrice">) {
  if (model.inputPrice === undefined || model.outputPrice === undefined) return "";
  const perMillion = (value: string) => {
    const amount = Number(value) * 1_000_000;
    if (!Number.isFinite(amount)) return "?";
    if (amount > 0 && amount < 0.01) return `$${Number(amount.toPrecision(2))}`;
    const rounded = Math.round(amount * 100) / 100;
    return `$${Number.isInteger(rounded) ? rounded : rounded.toFixed(2)}`;
  };
  return i18n.t("providers:apiConnections.perMTokens", { value1: perMillion(model.inputPrice), value2: perMillion(model.outputPrice) });
}

export function formatApiConnectionContext(contextWindow?: number) {
  if (!contextWindow) return "";
  if (contextWindow >= 1_000_000) return i18n.t("providers:apiConnections.mContext", { value1: Number((contextWindow / 1_000_000).toFixed(1)) });
  return i18n.t("providers:apiConnections.kContext", { value1: Math.round(contextWindow / 1000) });
}

/** One line under a model: its context and price, then why it is experimental. */
export function describeApiConnectionModel(runtime: ApiConnectionRuntime | null, model: ApiConnectionModel) {
  return [
    formatApiConnectionContext(model.contextWindow),
    formatApiConnectionPrice(model),
    runtime && isExperimentalApiConnectionModel(runtime, model.id)
      ? `${i18n.t(CLAUDE_CODE_EXPERIMENTAL_MODEL_LABEL_KEY)}: ${i18n.t(CLAUDE_CODE_EXPERIMENTAL_MODEL_REASON_KEY)}`
      : "",
  ].filter(Boolean).join(" · ");
}
