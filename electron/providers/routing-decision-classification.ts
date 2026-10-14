import { getUtilityInferenceCapability } from "../../src/lib/providers/model-catalog";
import { routingDecisionNativeOrder } from "../../src/lib/providers/routing-decision";
import type { RouteClassificationRequest, RouteClassification, UtilityInferenceMetadata } from "../../src/lib/providers/utility-inference";
import { requestHostGatewayCredentials } from "../provider-accounts/host-gateway-credentials";
import { peekApiConnection } from "../provider-accounts/gateway-runtime";
import { currentProviderAccountId, withProviderAccountScope } from "../provider-accounts/runtime-scope";
import { classifyGatewayRoute } from "./gateway-route-classification";

type Result = { value: RouteClassification | null; utility: UtilityInferenceMetadata };
/** A slow or broken preferred classifier must leave time for both native fallbacks. */
export const ROUTING_DECISION_ATTEMPT_MS = 9_000;
async function bounded<T>(signal: AbortSignal, run: (signal: AbortSignal) => Promise<T>, empty: T): Promise<T> {
  if (signal.aborted) return empty;
  const controller = new AbortController();
  const combined = AbortSignal.any([signal, controller.signal]);
  const timer = setTimeout(() => controller.abort(), ROUTING_DECISION_ATTEMPT_MS);
  const interrupted = new Promise<T>((resolve) => combined.addEventListener("abort", () => resolve(empty), { once: true }));
  try { return await Promise.race([run(combined).catch(() => empty), interrupted]); }
  finally { clearTimeout(timer); controller.abort(); }
}

export async function runRoutingDecisionClassification(args: {
  request: RouteClassificationRequest;
  signal: AbortSignal;
  native: (providerId: "codex" | "claude-code", model: string, signal: AbortSignal) => Promise<Result>;
  gateway?: typeof classifyGatewayRoute;
  credentials?: typeof requestHostGatewayCredentials;
}): Promise<Result> {
  const config = args.request.routingDecision ?? { mode: "automatic" };
  const startedAt = Date.now();
  const attempts: UtilityInferenceMetadata["attempts"] = [];
  let gateway: UtilityInferenceMetadata["gateway"];
  const finish = (result: Result): Result => ({ ...result, utility: { ...result.utility, routing: {
    providerId: result.value ? result.utility.providerId === "claude-code" ? "claude-code" : result.utility.providerId === "codex" ? "codex" : "gateway" : "local",
    model: result.utility.model, preferred: config, fallback: result.utility.degraded, elapsedMs: Math.min(600_000, Date.now() - startedAt),
    ...(gateway?.failure || result.utility.degraded ? { failure: gateway?.failure ?? "unavailable" } : {}), reportedCostUsd: gateway?.reportedCostUsd ?? null,
  } } });
  if (config.mode === "gateway" && !args.signal.aborted) {
    gateway = { connectionId: config.connectionId, model: config.model, ok: false, failure: "timeout" };
    const value = await bounded(args.signal, async (signal) => {
      const credential = await (args.credentials ?? requestHostGatewayCredentials)({}, config.connectionId, signal);
      if (signal.aborted) return null;
      if (!credential?.decisionToken) { gateway!.failure = "missing-key"; return null; }
      try { const result = await (args.gateway ?? classifyGatewayRoute)({ model: config.model, token: credential.decisionToken, input: args.request, signal,
        observe: (value) => { if (!signal.aborted) Object.assign(gateway!, value); } });
        if (!result && !signal.aborted && gateway!.failure === "timeout") gateway!.failure = "invalid-response";
        return result; }
      catch { if (!signal.aborted) gateway!.failure = "network"; return null; }
    }, null);
    gateway.ok = value !== null;
    if (value) { delete gateway.failure; return finish({ value, utility: { providerId: null, model: gateway.model, selectionReason: "explicit", degraded: false, attempts: [], gateway } }); }
  }
  for (const providerId of routingDecisionNativeOrder(config)) {
    if (args.signal.aborted) break;
    // Native fallback must not try a light model against an unrelated gateway shortlist.
    const account = peekApiConnection(providerId) ? "system-default" : currentProviderAccountId(providerId);
    const selection = providerId === "codex" ? { codexAccountProfileId: account } : { claudeAccountProfileId: account };
    const empty: Result = { value: null, utility: { providerId: null, model: null, selectionReason: "unavailable", degraded: true, attempts: [] } };
    const result = await withProviderAccountScope(selection, () => bounded(args.signal, (signal) => args.native(providerId, getUtilityInferenceCapability({ providerId }).defaultModel, signal), empty));
    attempts.push(...result.utility.attempts);
    if (result.value) return finish({ value: result.value, utility: { ...result.utility, attempts, degraded: Boolean(gateway) || providerId !== routingDecisionNativeOrder(config)[0] || attempts.length > 1, ...(gateway ? { gateway } : {}) } });
  }
  return finish({ value: null, utility: { providerId: null, model: null, selectionReason: "unavailable", degraded: true, attempts, ...(gateway ? { gateway } : {}), detail: "No routing decision model is available." } });
}
