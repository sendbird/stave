import { z } from "zod";
import { ProviderAccountSelectionSchema } from "../providers/provider-accounts";
import type { AgentRunTurnRoute } from "../../../electron/host-service/supervision/agent-run-runtime";
import type { RoutingDecisionConfig } from "../providers/routing-decision";

/** Private main/host input: never exposed as a tool or renderer authority. */
export const ConstrainedRouteInputSchema = z.object({
  requestId: z.uuid().optional(),
  workspaceId: z.string().min(1).max(256), taskId: z.string().min(1).max(150),
  parentTaskId: z.string().min(1).max(150).optional(),
  providerId: z.enum(["codex", "claude-code"]), prompt: z.string().min(1).max(20_000),
  model: z.string().min(1).max(200).optional(), effort: z.string().max(40).optional(),
  modelPinned: z.boolean().optional(), effortPinned: z.boolean().optional(),
  accounts: ProviderAccountSelectionSchema.optional(),
  allowedModels: z.array(z.string().min(1).max(200)).min(1).max(64).optional(),
}).strict();
export type ConstrainedRouteInput = z.infer<typeof ConstrainedRouteInputSchema>;
export type ConstrainedRouteResult = AgentRunTurnRoute & { allowedModels: string[]; decisionConfig?: RoutingDecisionConfig };
