/**
 * The stage-reporting tools an agent run turn uses. They are registered only on
 * a connection that carries an agent run grant key, and the host resolves the
 * agent run, stage and attempt from that key's active grant. No tool takes an
 * id, so a model cannot report for another stage.
 *
 * Used by: `electron/main/stave-mcp-server.ts`.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AGENT_RUN_TOOL_NAMES } from "../../src/lib/agent-runs/briefing";
import {
  StageBlockInputSchema,
  StageCompleteReportInputSchema,
} from "../../src/lib/agent-runs/domain";
import type { StaveTurnGrants } from "../providers/stave-turn-grants";
import type {
  blockAgentRunStage,
  getAgentRunForGrant,
  reportAgentRunStage,
} from "./agent-runs-service";

export function registerAgentRunTools(
  server: McpServer,
  grants: StaveTurnGrants,
  handlers: {
    getAgentRunForGrant: typeof getAgentRunForGrant;
    reportAgentRunStage: typeof reportAgentRunStage;
    blockAgentRunStage: typeof blockAgentRunStage;
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
}
