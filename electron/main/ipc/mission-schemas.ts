/**
 * IPC argument schemas for `window.api.missions`. Kept out of `schemas.ts`,
 * which is at its line ratchet. Each schema is checked against the shared
 * contract in `src/lib/missions/api.ts`.
 */
import { z } from "zod";
import {
  MISSION_USER_TURN_INTENTS,
  type MissionIdArgs,
  type MissionListArgs,
  type MissionNoteUserTurnArgs,
  type MissionRequestChangesArgs,
  type MissionStageRef,
} from "../../../src/lib/missions/api";
import {
  MISSION_LIMITS,
  MissionStartInputSchema,
} from "../../../src/lib/missions/domain";

const IdSchema = z.string().trim().min(1).max(MISSION_LIMITS.maxIdChars);

/**
 * The renderer starts agent runs only. Playbook missions without an agent
 * (retired with playbooks) can no longer be started; their old rows still load.
 */
export const MissionStartArgsSchema = MissionStartInputSchema.refine((input) => input.origin === "agent", {
  message: "Only agent runs can be started.",
  path: ["origin"],
});

export const MissionIdArgsSchema = z
  .object({ missionId: IdSchema })
  .strict() satisfies z.ZodType<MissionIdArgs>;

export const MissionListArgsSchema = z
  .object({
    workspaceId: IdSchema.optional(),
    limit: z.number().int().min(1).max(200).optional(),
  })
  .strict() satisfies z.ZodType<MissionListArgs>;

export const MissionStageRefSchema = z
  .object({
    missionId: IdSchema,
    stageId: IdSchema,
    attempt: z.number().int().min(1).max(MISSION_LIMITS.maxStageAttempts),
  })
  .strict() satisfies z.ZodType<MissionStageRef>;

export const MissionRequestChangesArgsSchema = MissionStageRefSchema.extend({
  feedback: z.string().trim().min(1).max(MISSION_LIMITS.maxFeedbackChars),
}).strict() satisfies z.ZodType<MissionRequestChangesArgs>;

export const MissionNoteUserTurnArgsSchema = z
  .object({
    missionId: IdSchema,
    intent: z.enum(MISSION_USER_TURN_INTENTS),
  })
  .strict() satisfies z.ZodType<MissionNoteUserTurnArgs>;
