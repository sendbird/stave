/**
 * Runs Draft with AI: one read-only turn on the utility lane, whose answer
 * `parsePlaybookDraft` turns into an editable playbook. Nothing is saved here.
 */
import {
  buildReadOnlyAuxRuntimeOptions,
  resolveAuxLaneRuntime,
} from "@/lib/providers/auxiliary-inference-policy";
import { buildPlaybookDraftPrompt, parsePlaybookDraft, type PlaybookDraftResult } from "@/lib/playbooks/draft-with-ai";
import type { NormalizedProviderEvent } from "@/lib/providers/provider.types";
import { useAppStore } from "./app.store";

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

const CANCELLED: PlaybookDraftResult = { ok: false, message: "Drafting was cancelled." };

function newTurnId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `playbook-draft-${crypto.randomUUID()}`
    : `playbook-draft-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Drafts a playbook from a description. Aborting `signal` (the panel closed)
 * stops the turn and resolves as cancelled, so a late answer never lands.
 */
export async function draftPlaybookWithAi(
  description: string,
  options: { signal?: AbortSignal } = {},
): Promise<PlaybookDraftResult> {
  const { signal } = options;
  if (signal?.aborted) return CANCELLED;
  const provider = window.api?.provider;
  const streamTurn = provider?.streamTurn;
  if (!streamTurn) return { ok: false, message: "Drafting needs the desktop app." };
  const state = useAppStore.getState();
  const lane = resolveAuxLaneRuntime({
    lane: "utility",
    policy: state.settings.auxiliaryInferencePolicy,
    legacyProviderId: state.settings.utilityInferenceProvider,
  });
  if (!lane.enabled) return { ok: false, message: "The utility model is turned off in Settings." };
  const turnId = newTurnId();
  const abort = () => void provider?.abortTurn?.({ turnId })?.catch(() => undefined);
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const text = await collectText(
      streamTurn({
        turnId,
        providerId: lane.providerId,
        prompt: buildPlaybookDraftPrompt(description),
        runtimeOptions: buildReadOnlyAuxRuntimeOptions({
          providerId: lane.providerId,
          model: lane.model,
          effortOverrides: lane.effortOverrides,
        }),
      }),
    );
    if (signal?.aborted) return CANCELLED;
    return parsePlaybookDraft(text, new Date());
  } catch (error) {
    if (signal?.aborted) return CANCELLED;
    return {
      ok: false,
      message: error instanceof Error && error.message ? error.message : "Drafting failed. Try again.",
    };
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}
