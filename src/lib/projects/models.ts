/**
 * The models a project mission may run on, per provider: the models Stave
 * offers in its pickers. The coordinator names one in `stave_start_mission`,
 * and the user may change it before starting a proposal.
 */
import { CLAUDE_SDK_MODEL_OPTIONS, CODEX_MODEL_OPTIONS, getDefaultModelForProvider } from "@/lib/providers/model-catalog";
import type { MissionProviderId } from "./domain";

export const PROJECT_MISSION_MODELS: Record<MissionProviderId, readonly string[]> = {
  "claude-code": CLAUDE_SDK_MODEL_OPTIONS,
  codex: CODEX_MODEL_OPTIONS,
};

export function isProjectMissionModel(providerId: MissionProviderId, model: string): boolean {
  return PROJECT_MISSION_MODELS[providerId].includes(model);
}

/** The model a proposal runs on when it names none. */
export function defaultProjectMissionModel(providerId: MissionProviderId): string {
  return getDefaultModelForProvider({ providerId });
}
