import { buildAgentRunStartInput } from "@/lib/missions/agent-run";
import type { MissionDetail } from "@/lib/missions/api";
import { createMission, type MissionStageRecord } from "@/lib/missions/domain";
import { buildMissionReport } from "@/lib/missions/report";

/**
 * Agent runs for the mission preview and the render tests: working, needs
 * you, stuck, ready (with a pull request), and failed. Times count from
 * `start`, so tests are exact and the preview looks recent.
 */
export const AGENT_RUN_ASSIGNMENT = "Fix the billing table overflow on narrow screens.";
export const AGENT_RUN_PROMPT_ASSIGNMENT_HEADING = `## Assignment\n\n${AGENT_RUN_ASSIGNMENT}`;

export function buildAgentRunFixtures(start: Date) {
  const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000).toISOString();
  const created = createMission({
    id: "agent-run-preview",
    input: buildAgentRunStartInput({
      workspaceId: "preview-workspace",
      taskId: "preview-task",
      agent: { name: "Implementer" },
      assignment: AGENT_RUN_ASSIGNMENT,
      doneWhen: "The table scrolls below 640px and the checks pass.",
      now: start,
    }),
    repositoryPath: "/tmp/preview-project",
    fingerprint: { providerId: "claude-code", model: "sonnet" },
    now: start,
  });
  const base = created.upserts[0]!;
  const record = (patch: Partial<MissionStageRecord>): MissionStageRecord => ({ ...base, startedAt: at(0), ...patch });
  const detail = (
    mission: Partial<MissionDetail["mission"]>,
    stage: Partial<MissionStageRecord>,
    extra: Partial<MissionDetail> = {},
  ): MissionDetail => ({
    mission: { ...created.mission, turnCount: 6, updatedAt: at(0), ...mission },
    stages: [record(stage)],
    events: [],
    report: null,
    usage: { turns: 6, measuredTurns: 6, inputTokens: 148_000, outputTokens: 21_400, costUsd: 1.84 },
    ...extra,
  });

  const working = detail({}, { status: "running" });
  const needsYou = detail(
    {},
    { status: "blocked", blockReason: "agent-blocked", detail: "Which breakpoint should the table switch at: 640px or 768px?" },
  );
  const stuck = detail({}, { status: "stuck", detail: "The tests have been pending for 20 minutes." });

  const revision = { status: "known" as const, revision: "rev-1" };
  const readyRecord: Partial<MissionStageRecord> = {
    status: "completed",
    endedAt: at(23),
    reportRevision: 1,
    report: {
      outcome: "complete",
      summary: "Replaced the fixed minimum width with a scroll container and added a 600px test. Typecheck and the billing tests pass.",
      decisions: [{ decision: "Scroll the table, not the page", reason: "The amount column must stay readable." }],
      evidence: [{ label: "Typecheck", kind: "check", command: "bun run typecheck", toolCallId: "call-typecheck" }],
      artifacts: [{ label: "Draft PR #612", url: "https://github.com/acme/app/pull/612" }],
      acceptanceCriteria: [
        { text: "The table scrolls below 640px", status: "met" },
        { text: "bun run typecheck passes", status: "met" },
        { text: "The invoice table has the same fix", status: "unverified" },
      ],
      reportedAt: at(23),
      turnId: "turn-3",
    },
    facts: {
      diff: { filesChanged: 7, insertions: 184, deletions: 32 },
      commands: [
        {
          command: "bun run typecheck",
          exitCode: 0,
          toolCallId: "call-typecheck",
          turnId: "turn-3",
          outcome: "succeeded",
          provenance: "stave-runner",
          sourceRevision: revision,
        },
      ],
      toolCalls: [],
      action: null,
      currentTurnId: "turn-3",
      workspaceRevision: revision,
    },
  };
  const ended = (value: MissionDetail, endedAt: string): MissionDetail => ({
    ...value,
    report: {
      ...buildMissionReport({
        aggregate: value,
        workspace: { branch: "fix/billing-overflow", branchPushed: true, openPullRequest: null },
        endedAt: new Date(endedAt),
      }),
      usage: value.usage,
    },
  });
  const ready = ended(detail({ state: "completed", updatedAt: at(23) }, readyRecord), at(23));
  const failed = detail(
    {
      state: "stopped",
      stopReason: "turn-cap-reached",
      reasonDetail: "The run used all 60 turns before it finished.",
      turnCount: 60,
      updatedAt: at(41),
    },
    { status: "cancelled", endedAt: at(41), detail: "The run stopped at its turn limit." },
  );
  const stopped = detail({ state: "cancelled", updatedAt: at(9) }, { status: "cancelled", endedAt: at(9) });
  return { working, needsYou, stuck, ready, failed: ended(failed, at(41)), stopped };
}
