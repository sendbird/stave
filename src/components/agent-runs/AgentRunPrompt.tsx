import { i18n, useTranslation } from "@/i18n";
import { useMemo } from "react";
import { resolveAgentRunPrompt, type AgentRunPromptView } from "@/lib/agent-runs/agent-run-status";
import { useAppStore } from "@/store/app.store";
import { useAgentRunForTurn } from "@/store/agent-runs-store";
import type { AgentRunPromptProvenance } from "@/types/chat";
import { InstructionDisclosure } from "./StageCard";

/** A user message an agent run started: the user's own words and Stave's instructions. */
export type AgentRunPrompt = AgentRunPromptView;

/**
 * Splits the user message that started a turn of an agent run, so the bubble
 * shows the assignment and the compiled prompt stays one click away. A row the
 * host marked splits on its own; an older one waits for the run that started
 * its turn. Null for every other message.
 */
export function useAgentRunPrompt(args: {
  taskId: string;
  /** The turn the message started; undefined for any message that started none. */
  turnId: string | undefined;
  text: string;
  provenance?: AgentRunPromptProvenance;
  /** The send is still waiting on its run: the row the run will write, drawn early. */
  pending?: boolean;
}): AgentRunPrompt | null {
  const workspaceId = useAppStore((state) => state.activeWorkspaceId);
  const marked = Boolean(args.provenance || args.pending);
  const run = useAgentRunForTurn(workspaceId, args.taskId, marked ? undefined : args.turnId);
  const runAssignment = run?.assignment;
  return useMemo(
    () =>
      resolveAgentRunPrompt({
        text: args.text,
        provenance: args.provenance,
        runAssignment,
        pending: args.pending,
      }),
    [args.pending, args.provenance, args.text, runAssignment],
  );
}

/**
 * The collapsed compiled prompt under an agent run's user bubble. Inert while
 * the run has not written it yet, so the bubble keeps its shape.
 */
export function AgentRunInstructions({ text }: { text: string | null }) {
  useTranslation();
  return <InstructionDisclosure label={i18n.t("agentRuns:agentRunPrompt.label")} text={text ?? ""} disabled={text === null} />;
}
