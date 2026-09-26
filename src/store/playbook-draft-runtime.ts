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

export async function draftPlaybookWithAi(description: string): Promise<PlaybookDraftResult> {
  const streamTurn = window.api?.provider?.streamTurn;
  if (!streamTurn) return { ok: false, message: "Drafting needs the desktop app." };
  const state = useAppStore.getState();
  const lane = resolveAuxLaneRuntime({
    lane: "utility",
    policy: state.settings.auxiliaryInferencePolicy,
    legacyProviderId: state.settings.utilityInferenceProvider,
  });
  if (!lane.enabled) return { ok: false, message: "The utility model is turned off in Settings." };
  try {
    const text = await collectText(
      streamTurn({
        providerId: lane.providerId,
        prompt: buildPlaybookDraftPrompt(description),
        runtimeOptions: buildReadOnlyAuxRuntimeOptions({
          providerId: lane.providerId,
          model: lane.model,
          effortOverrides: lane.effortOverrides,
        }),
      }),
    );
    return parsePlaybookDraft(text, new Date());
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error && error.message ? error.message : "Drafting failed. Try again.",
    };
  }
}
