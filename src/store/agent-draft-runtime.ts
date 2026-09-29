/**
 * Describe to create: runs one utility turn and turns the answer into an
 * unsaved custom agent draft. Nothing is saved here.
 */
import { buildAgentDraftPrompt, parseAgentDraft, type AgentDraftResult } from "@/lib/agents/draft-with-ai";
import { runUtilityTextTurn } from "./utility-text-turn";

export async function draftAgentWithAi(
  description: string,
  options: { takenIds: Iterable<string>; signal?: AbortSignal },
): Promise<AgentDraftResult> {
  const result = await runUtilityTextTurn({
    prompt: buildAgentDraftPrompt(description),
    turnIdPrefix: "agent-draft",
    signal: options.signal,
  });
  if (!result.ok) return { ok: false, message: result.cancelled ? "Drafting was cancelled." : result.message };
  return parseAgentDraft(result.text, options.takenIds);
}
