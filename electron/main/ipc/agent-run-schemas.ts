/**
 * IPC argument schemas for `window.api.agentRuns`. Kept out of `schemas.ts`,
 * which is at its line ratchet. Each schema is checked against the shared
 * contract in `src/lib/agent-runs/api.ts`.
 */
import { z } from "zod";
import {
  AGENT_RUN_USER_TURN_INTENTS,
  type AgentRunIdArgs,
  type AgentRunListArgs,
  type AgentRunNoteUserTurnArgs,
  type AgentRunRequestChangesArgs,
  type AgentRunStageRef,
} from "../../../src/lib/agent-runs/api";
import {
  AGENT_RUN_LIMITS,
  AgentRunStartInputSchema,
} from "../../../src/lib/agent-runs/domain";

const IdSchema = z.string().trim().min(1).max(AGENT_RUN_LIMITS.maxIdChars);

/**
 * The renderer starts agent runs only. Legacy runs without an agent (from
 * saved workflows, since retired) can no longer be started; their old rows
 * still load.
 */
export const AgentRunStartArgsSchema = AgentRunStartInputSchema.refine((input) => input.origin === "agent", {
  message: "Only agent runs can be started.",
  path: ["origin"],
});

export const AgentRunIdArgsSchema = z
  .object({ agentRunId: IdSchema })
  .strict() satisfies z.ZodType<AgentRunIdArgs>;

export const AgentRunListArgsSchema = z
  .object({
    workspaceId: IdSchema.optional(),
    limit: z.number().int().min(1).max(200).optional(),
  })
  .strict() satisfies z.ZodType<AgentRunListArgs>;

export const AgentRunStageRefSchema = z
  .object({
    agentRunId: IdSchema,
    stageId: IdSchema,
    attempt: z.number().int().min(1).max(AGENT_RUN_LIMITS.maxStageAttempts),
  })
  .strict() satisfies z.ZodType<AgentRunStageRef>;

export const AgentRunRequestChangesArgsSchema = AgentRunStageRefSchema.extend({
  feedback: z.string().trim().min(1).max(AGENT_RUN_LIMITS.maxFeedbackChars),
}).strict() satisfies z.ZodType<AgentRunRequestChangesArgs>;

export const AgentRunNoteUserTurnArgsSchema = z
  .object({
    agentRunId: IdSchema,
    intent: z.enum(AGENT_RUN_USER_TURN_INTENTS),
  })
  .strict() satisfies z.ZodType<AgentRunNoteUserTurnArgs>;
