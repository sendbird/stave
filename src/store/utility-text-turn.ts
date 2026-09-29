/**
 * One read-only turn on the utility lane that returns the model's text. Shared
 * by the agent features that ask the model for a small JSON answer (drafting
 * an agent, suggesting an instruction change). No secrets, tools, writes or
 * network: `buildReadOnlyAuxRuntimeOptions` decides the runtime options and
 * the lane's on/off switch in Settings is honoured.
 */
import {
  buildReadOnlyAuxRuntimeOptions,
  resolveAuxLaneRuntime,
} from "@/lib/providers/auxiliary-inference-policy";
import type { NormalizedProviderEvent } from "@/lib/providers/provider.types";
import { useAppStore } from "./app.store";

export type UtilityTextResult = { ok: true; text: string } | { ok: false; message: string; cancelled?: boolean };

async function collectText(stream: unknown): Promise<string> {
  const resolved = await stream;
  const events: unknown[] = Array.isArray(resolved) ? resolved : [];
  if (!Array.isArray(resolved) && resolved && typeof resolved === "object" && Symbol.asyncIterator in resolved) {
    for await (const event of resolved as AsyncIterable<unknown>) events.push(event);
  }
  return events
    .filter((event): event is Extract<NormalizedProviderEvent, { type: "text" }> =>
      Boolean(event && typeof event === "object" && (event as { type?: unknown }).type === "text"),
    )
    .map((event) => event.text)
    .join("")
    .trim();
}

function newTurnId(prefix: string): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

const CANCELLED: UtilityTextResult = { ok: false, message: "Cancelled.", cancelled: true };

/**
 * Runs `prompt` once. Aborting `signal` stops the turn and resolves as
 * cancelled, so a late answer never lands after the caller moved on.
 */
export async function runUtilityTextTurn(args: {
  prompt: string;
  turnIdPrefix: string;
  signal?: AbortSignal;
}): Promise<UtilityTextResult> {
  const { signal } = args;
  if (signal?.aborted) return CANCELLED;
  const provider = window.api?.provider;
  const streamTurn = provider?.streamTurn;
  if (!streamTurn) return { ok: false, message: "This needs the desktop app." };
  const state = useAppStore.getState();
  const lane = resolveAuxLaneRuntime({
    lane: "utility",
    policy: state.settings.auxiliaryInferencePolicy,
    legacyProviderId: state.settings.utilityInferenceProvider,
  });
  if (!lane.enabled) return { ok: false, message: "The utility model is turned off in Settings." };
  const turnId = newTurnId(args.turnIdPrefix);
  const abort = () => void provider?.abortTurn?.({ turnId })?.catch(() => undefined);
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const text = await collectText(
      streamTurn({
        turnId,
        providerId: lane.providerId,
        prompt: args.prompt,
        runtimeOptions: buildReadOnlyAuxRuntimeOptions({
          providerId: lane.providerId,
          model: lane.model,
          effortOverrides: lane.effortOverrides,
        }),
      }),
    );
    return signal?.aborted ? CANCELLED : { ok: true, text };
  } catch (error) {
    if (signal?.aborted) return CANCELLED;
    return {
      ok: false,
      message: error instanceof Error && error.message ? error.message : "The request failed. Try again.",
    };
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}
