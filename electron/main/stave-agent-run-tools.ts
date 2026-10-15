/**
 * The stage-reporting tools an agent run turn uses. They are registered only on
 * a connection that carries an agent run grant key, and the host resolves the
 * agent run, stage and attempt from that key's active grant. No tool takes an
 * id, so a model cannot report for another stage.
 *
 * Used by: `electron/main/stave-mcp-server.ts`.
 */
import { AgentResourceRequestObjectSchema } from "../../src/lib/agent-runs/resources";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AGENT_RUN_TOOL_NAMES } from "../../src/lib/agent-runs/briefing";
import {
  StageBlockInputSchema,
  StageCompleteReportInputSchema,
} from "../../src/lib/agent-runs/domain";
import { EventWaitInputSchema } from "../../src/lib/agent-runs/event-wait";
import { RunWorkspaceScriptInputSchema } from "../host-service/supervision/agent-run-workspace-script";
import type { StaveTurnGrants } from "../providers/stave-turn-grants";
import type {
  blockAgentRunStage,
  requestAgentRunResources,
  getAgentRunForGrant,
  reportAgentRunStage,
  waitForAgentRunEvent,
  runAgentWorkspaceScript,
} from "./agent-runs-service";

export function registerAgentRunTools(
  server: McpServer,
  grants: StaveTurnGrants,
  handlers: {
    getAgentRunForGrant: typeof getAgentRunForGrant;
    reportAgentRunStage: typeof reportAgentRunStage;
    blockAgentRunStage: typeof blockAgentRunStage;
    requestAgentRunResources: typeof requestAgentRunResources;
    waitForAgentRunEvent: typeof waitForAgentRunEvent;
    runAgentWorkspaceScript: typeof runAgentWorkspaceScript;
  },
) {
  const { agentRunKey } = grants;
  if (!agentRunKey) return;
  const toStructuredResult = <T extends Record<string, unknown>>(value: T) => ({
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value,
  });

  server.registerTool(
    AGENT_RUN_TOOL_NAMES.get,
    {
      description:
        "Read the agent run this turn belongs to: the workflow's purpose, the assignment, every stage with its status, the current stage's instruction and Done when, earlier stages' summaries, and the acceptance criteria. Read-only. Available only in turns a Stave agent run started.",
      annotations: { readOnlyHint: true },
    },
    async () =>
      toStructuredResult({
        agentRun: await handlers.getAgentRunForGrant({ agentRunKey }),
      }),
  );

  server.registerTool(
    AGENT_RUN_TOOL_NAMES.report,
    {
      description:
        "Report the current run stage as done before this turn ends. Give a short summary, the decisions you made and why, the evidence you gathered, links to artifacts, and the status of each acceptance criterion. Cite the command you ran or the tool call id for evidence: Stave marks evidence verified only when it saw that call succeed in this stage's turns. Never report unverified work as complete. Stave knows which stage this turn belongs to; do not pass ids.",
      inputSchema: StageCompleteReportInputSchema.shape,
    },
    async (report) =>
      toStructuredResult({
        report: await handlers.reportAgentRunStage({ agentRunKey, report }),
      }),
  );

  server.registerTool(AGENT_RUN_TOOL_NAMES.resources, {
    description: "Propose a same-provider model or effort for the next supervised turn of an adaptive Run. Cite exact turn ids from this stage attempt. Explain a demonstrated capability mismatch or a bounded mechanical step; an environment or permission failure does not justify escalation. Stave validates eligibility, pins, the two-change limit and two-turn cooldown. This call never starts a turn or changes permissions. Disabled Runs refuse it.",
    inputSchema: AgentResourceRequestObjectSchema.shape,
  }, async (request) => toStructuredResult(await handlers.requestAgentRunResources({ agentRunKey, request })));

  server.registerTool(
    AGENT_RUN_TOOL_NAMES.block,
    {
      description:
        "Report that you cannot finish the current run stage, and name exactly what is missing: input from the user, a permission, something in the environment, or an external system. The run waits for the user, and a reply in the task resumes the stage.",
      inputSchema: StageBlockInputSchema.shape,
    },
    async (block) =>
      toStructuredResult({
        block: await handlers.blockAgentRunStage({ agentRunKey, block }),
      }),
  );

  server.registerTool(
    AGENT_RUN_TOOL_NAMES.wait,
    {
      description:
        "Wait inside this run for one outside event instead of ending the stage: a pull request's checks finishing (pull_request_checks), new review comments, approvals or change requests (pull_request_review), a time (time, with `at`), or delegated work of this task finishing (delegated_completion). Call it, then end this turn. The run stays running and spends no turns while it waits; when the event comes, Stave starts the next turn of this stage with what happened (failing checks with links, new comments, the finished work, or the time), and that turn counts against the run's turn limit. A merged or closed pull request ends the wait as its event. One wait per run: a new call replaces the earlier one. It expires after 24 hours by default (`expiresAt`, at most 7 days) and wakes the run at most `maxWakes` times (default 5); after that the run pauses for the user. Do not use it to poll, and do not wait when you can finish the stage now. Stave knows which run and stage this turn belongs to; do not pass ids.",
      inputSchema: EventWaitInputSchema.shape,
    },
    async (request) =>
      toStructuredResult({
        ...(await handlers.waitForAgentRunEvent({ agentRunKey, request })),
      }),
  );
  server.registerTool(AGENT_RUN_TOOL_NAMES.script, {
    description: "Run a configured workspace action script as a host check of the final revision, then report the stage again. Pass its scriptId from the stage's workspace-check instruction. The execution definition must match the hash frozen at admission. Returns exitCode, verified, sourceRevision, completedRevision, bounded outputTail and a reason when verification fails; a failed, changing or stale check does not satisfy a required stave-check criterion. Only a write-capable agent in a primary run's AI stage can call this. One script at a time per run; wait for the result before retrying. The run stopping or pausing aborts the process; execution is capped at 30 minutes.",
    inputSchema: RunWorkspaceScriptInputSchema.shape,
  }, async ({ scriptId }) => toStructuredResult({ ...await handlers.runAgentWorkspaceScript({ agentRunKey, scriptId }) }));
}
