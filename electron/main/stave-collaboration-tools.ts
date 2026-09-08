import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  WORKER_CONTEXT_MAX_CHARS,
  WORKER_TASK_MAX_CHARS,
} from "../../src/lib/providers/worker-mode";
import type { StaveCollaborationGrants } from "../providers/stave-collaboration-grants";
import type { consultAdvisor, runAcpWorker } from "./stave-mcp-service";

/** The request connection selects the capability; model arguments cannot override it. */
export function registerCollaborationTools(
  server: McpServer,
  grants: StaveCollaborationGrants,
  handlers: {
    consultAdvisor: typeof consultAdvisor;
    runAcpWorker: typeof runAcpWorker;
  },
) {
  const { consultAdvisor, runAcpWorker } = handlers;
  const { consultKey, workerKey } = grants;
  const toStructuredResult = <T extends Record<string, unknown>>(value: T) => ({
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value,
  });
  if (consultKey)
    server.registerTool(
      "stave_consult_advisor",
      {
        description:
          "Consult the on-demand Advisor armed for the current turn: a separate read-only model that answers one question with advice. Stave supplies this turn's authorization automatically; each turn has a limited consult budget.",
        inputSchema: {
          question: z
            .string()
            .min(1)
            .describe("What you want advice on. Be specific."),
          context: z
            .string()
            .optional()
            .describe(
              "Minimal code/plan excerpts the Advisor needs. It has no repository or tool access and sees nothing else.",
            ),
        },
      },
      async ({ question, context }) =>
        toStructuredResult({
          consult: await consultAdvisor({
            consultKey,
            question,
            ...(context ? { context } : {}),
          }),
        }),
    );

  if (workerKey)
    server.registerTool(
      "stave_run_worker",
      {
        description:
          "Run one bounded task through the same-provider Worker armed for the current turn. The Worker gets a fresh session in the current workspace and returns its result to the primary for review.",
        inputSchema: {
          task: z
            .string()
            .min(1)
            .max(WORKER_TASK_MAX_CHARS)
            .describe(
              "A complete, standalone delegated task including file scope and verification requirements.",
            ),
          context: z
            .string()
            .max(WORKER_CONTEXT_MAX_CHARS)
            .optional()
            .describe(
              "Optional small excerpts or constraints the Worker cannot discover from the workspace.",
            ),
        },
      },
      async ({ task, context }) =>
        toStructuredResult({
          worker: await runAcpWorker({
            workerKey,
            task,
            ...(context ? { context } : {}),
          }),
        }),
    );
}
