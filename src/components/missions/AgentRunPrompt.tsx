import { useMemo } from "react";
import { extractRunAssignment } from "@/lib/missions/agent-run-view";
import { useAppStore } from "@/store/app.store";
import { useAgentRunForTurn } from "@/store/missions-store";
import { InstructionDisclosure } from "./StageCard";

/** A user message an agent run started: the user's own words and Stave's instructions. */
export interface AgentRunPrompt {
  /** The assignment as the user wrote it; null for a prompt that carries none. */
  assignment: string | null;
  /** The whole compiled prompt, for the disclosure. */
  instructions: string;
}

/**
 * Splits the user message that started a turn of an agent run, so the bubble
 * shows the assignment and the compiled prompt stays one click away. Null for
 * every other message.
 */
export function useAgentRunPrompt(args: {
  taskId: string;
  /** The turn the message started; undefined for any message that started none. */
  turnId: string | undefined;
  text: string;
}): AgentRunPrompt | null {
  const workspaceId = useAppStore((state) => state.activeWorkspaceId);
  const run = useAgentRunForTurn(workspaceId, args.taskId, args.turnId);
  const assignment = run?.assignment;
  return useMemo(
    () =>
      run && assignment !== undefined
        ? { assignment: extractRunAssignment(args.text, assignment), instructions: args.text }
        : null,
    [args.text, assignment, run],
  );
}

/** The collapsed compiled prompt under an agent run's user bubble. */
export function AgentRunInstructions({ text }: { text: string }) {
  return <InstructionDisclosure label="Run instructions" text={text} />;
}
