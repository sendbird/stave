import { i18n } from "@/i18n/runtime";
import type { ChatMessage, ToolUsePart } from "@/types/chat";
import type { WorkGraph } from "@/lib/work-graph/work-graph.types";
import { createWorkGraph, reduceWorkGraphEvent } from "@/lib/work-graph/work-graph-reducer";
import { parseToolInput, truncateWorkText } from "@/lib/providers/subagent-identity";
import { selectDelegationExchanges, sortDelegationExchanges, type DelegationExchange, type SelectDelegationExchangesArgs } from "./exchange";
import { isExchangeStatusLive } from "./format";

function isSpawnHandle(part: ToolUsePart) {
  if (part.state === "output-error" || !/^collaboration:spawn_?agent$/i.test(part.toolName)) return false;
  const output = part.output ? parseToolInput(part.output) : null;
  return Boolean(output && (output.newThreadId || output.receiverThreadId || Array.isArray(output.receiverThreadIds)));
}

/** Tool parts survive SQL turn-event compaction; no transcript fetch is needed. */
export function selectTaskSubagents(args: SelectDelegationExchangesArgs & { messages: readonly ChatMessage[] }): DelegationExchange[] {
  const graphs = new Map<string, WorkGraph>();
  const partsById = new Map<string, ToolUsePart>();
  const receipts = new Map<string, NonNullable<ChatMessage["terminalReceipt"]>>();
  for (const message of args.messages) {
    if (message.role !== "assistant" || !message.turnId || message.providerId === "user") continue;
    if (message.terminalReceipt?.completedAt) receipts.set(message.turnId, message.terminalReceipt);
    const now = Date.parse(message.startedAt ?? "") || 0;
    let graph = graphs.get(message.turnId) ?? createWorkGraph({ turnId: message.turnId, providerId: message.providerId, startedAt: now });
    for (const part of message.parts ?? []) {
      if (part.type !== "tool_use") continue;
      if (part.toolUseId) partsById.set(part.toolUseId, part);
      graph = reduceWorkGraphEvent(graph, {
        type: "tool", toolUseId: part.toolUseId, toolName: part.toolName, input: part.input,
        state: "input-available", agentId: part.agentId, ownerAgentId: part.ownerAgentId, parentToolUseId: part.parentToolUseId,
      }, now);
      for (const content of part.progressMessages ?? []) {
        graph = reduceWorkGraphEvent(graph, { type: "subagent_progress", toolUseId: part.toolUseId, agentId: part.agentId, content }, now);
      }
      // Turn finalization also seals unfinished tool parts; that is not a result.
      if (part.toolUseId && !isSpawnHandle(part) && (part.state === "output-error" || (part.state === "output-available" && part.output !== undefined))) {
        graph = reduceWorkGraphEvent(graph, { type: "tool_result", tool_use_id: part.toolUseId, output: part.output ?? "", isError: part.state === "output-error" }, now);
      }
    }
    graphs.set(message.turnId, graph);
  }
  // The live/retained graph has authoritative timing and status for its turn.
  if (args.workGraph) graphs.set(args.workGraph.turnId, args.workGraph);
  const rows = selectDelegationExchanges({ delegatedTasks: args.delegatedTasks, childBlockedByDelegationKey: args.childBlockedByDelegationKey });
  for (const graph of graphs.values()) {
    for (const exchange of selectDelegationExchanges({ workGraph: graph, includeSubagents: true })) {
      const part = exchange.ref.toolUseId ? partsById.get(exchange.ref.toolUseId) : undefined;
      const workerTools = graph.orderedWorkItemIds.map((id) => graph.workItemsById[id]).filter((item) => item?.nodeKey === exchange.ref.nodeKey);
      const latestTool = workerTools.at(-1);
      // Plan updates replace their part in place; insertion order is not recency.
      const planPart = workerTools.map((item) => item?.toolUseId ? partsById.get(item.toolUseId) : undefined)
        .filter((part) => part?.toolName.toLowerCase() === "todowrite").at(-1);
      const todos = planPart ? parseToolInput(planPart.input)?.todos : null;
      const current = Array.isArray(todos) ? todos.find((item) => item?.status === "in_progress" && typeof item.content === "string")?.content : null;
      const progress = exchange.outcome.progress ?? [];
      const receipt = receipts.get(graph.turnId);
      const unsettled = isExchangeStatusLive(exchange.outcome.status) && receipt;
      // A graph rebuilt here dates every event at its message's start, so its
      // times are stand-ins: keep only what the provider measured.
      const rebuilt = graph !== args.workGraph;
      rows.push({
        ...exchange,
        id: `${graph.turnId}:${exchange.id}`,
        ref: { ...exchange.ref, turnId: graph.turnId },
        ...(rebuilt ? {
          timing: {
            ...exchange.timing,
            observed: false as const,
            ...(part?.elapsedSeconds != null ? { elapsedMs: part.elapsedSeconds * 1000 } : {}),
          },
        } : {}),
        outcome: {
          ...exchange.outcome,
          ...(unsettled ? {
            status: receipt.outcome === "failed" ? "failed" as const : receipt.outcome === "cancelled" ? "cancelled" as const : "unresolved" as const,
            ...(receipt.error ? { error: receipt.error } : {}),
          } : {}),
          ...(part?.output && part.state === "output-available" && !isSpawnHandle(part) ? { result: part.output } : {}),
          ...(latestTool ? { progress: [...progress, current ?? latestTool.title] } : {}),
        },
      });
    }
  }
  return sortDelegationExchanges(rows);
}

export function describeSubagentState(exchange: DelegationExchange): string {
  // A delegate waiting for a person is the one thing the reader can act on.
  if (exchange.outcome.needsUser) return i18n.t("agentRuns:subagentSummary.needsYou");
  if (exchange.outcome.waiting && isExchangeStatusLive(exchange.outcome.status)) return i18n.t("agentRuns:subagentSummary.waiting");
  switch (exchange.outcome.status) {
    case "queued": return i18n.t("agentRuns:subagentSummary.queued");
    case "running": return i18n.t("agentRuns:subagentSummary.running");
    case "returned": return i18n.t("agentRuns:subagentSummary.done");
    case "failed": return i18n.t("agentRuns:subagentSummary.failed");
    case "cancelled": return i18n.t("agentRuns:subagentSummary.stopped");
    case "timed_out": return i18n.t("agentRuns:subagentSummary.extraCopy405");
    case "unresolved": return i18n.t("agentRuns:subagentSummary.unresolved");
  }
}

/**
 * How a delegate reads in a one-line summary: `working` is the only one that
 * moves (the state vocabulary's rule), `waiting` sits between turns on its
 * own, `needs-you` waits for the user.
 */
export type SubagentLineState = "needs-you" | "working" | "waiting" | "queued" | "done" | "failed" | "stopped";

export function subagentLineState(exchange: DelegationExchange): SubagentLineState {
  if (exchange.outcome.needsUser) return "needs-you";
  switch (exchange.outcome.status) {
    case "queued": return "queued";
    case "running": return exchange.outcome.waiting ? "waiting" : "working";
    case "returned": return "done";
    case "failed":
    case "timed_out": return "failed";
    case "cancelled":
    case "unresolved": return "stopped";
  }
}

const LINE_ORDER: Record<SubagentLineState, number> = { "needs-you": 0, working: 1, waiting: 2, queued: 3, failed: 4, done: 5, stopped: 6 };

/**
 * The delegates for a one-line summary: the one that needs the user first,
 * then the live ones. Settled ones fold into counts while any is live, so a
 * long list never pushes the moving one past the line's end.
 */
export function planSubagentLine(rows: readonly DelegationExchange[]): {
  shown: DelegationExchange[];
  folded: { state: "done" | "failed" | "stopped"; count: number }[];
} {
  const ordered = [...rows].sort((a, b) => LINE_ORDER[subagentLineState(a)] - LINE_ORDER[subagentLineState(b)]);
  const live = ordered.filter((row) => isExchangeStatusLive(row.outcome.status) || row.outcome.needsUser);
  if (!live.length) return { shown: ordered, folded: [] };
  const folded = (["failed", "done", "stopped"] as const)
    .map((state) => ({ state, count: ordered.filter((row) => !live.includes(row) && subagentLineState(row) === state).length }))
    .filter((group) => group.count > 0);
  return { shown: live, folded };
}

/** The step a live delegate is on, from its latest progress; null once it settled. */
export function subagentCurrentStep(exchange: DelegationExchange): string | null {
  if (!isExchangeStatusLive(exchange.outcome.status) || exchange.outcome.needsUser || exchange.outcome.waiting) return null;
  const step = exchange.outcome.progress?.at(-1);
  return step?.trim() ? step.trim() : null;
}

export function describeSubagentSummary(rows: readonly DelegationExchange[]): string | null {
  return rows.length ? rows.map((row) => `${row.title} ${describeSubagentState(row)}`).join(" · ") : null;
}

/** Markdown read as plain words: no heading, list or quote markers, emphasis, code ticks or link targets. */
export function plainMarkdownLine(line: string): string {
  return line
    .replace(/^\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s*)/, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

/** A delegated Agent run's report (`## Run complete …` with a `### Stages` list). */
const RUN_REPORT_STAGE = /^\s*- \*\*[^*]+\*\* — /;

export function subagentResultLine(exchange: DelegationExchange): string | undefined {
  if (exchange.outcome.error) return truncateWorkText(exchange.outcome.error);
  const result = exchange.outcome.result;
  if (!result) return undefined;
  const lines = result.trim().split("\n");
  // A framed report can prepend a bracketed notice to an indented answer.
  // Preview the answer while retaining the original output for full details.
  const framed = /^\[[^\]]+\].*:\s*$/.test(lines[0] ?? "") && /^ {2}\S/.test(lines[1] ?? "");
  if (framed) return truncateWorkText(lines.slice(1).map((line) => line.replace(/^ {2}/, "")).join("\n"));
  // A Run report previews its last stage's outcome, not its header or the assignment it repeats.
  const lastStage = /^##\s/.test(lines[0] ?? "") ? [...lines].reverse().find((line) => RUN_REPORT_STAGE.test(line)) : undefined;
  if (lastStage) return truncateWorkText(plainMarkdownLine(lastStage));
  // Other markdown reads as plain text; headings drop out when there is more to say.
  const content = lines.filter((line) => !/^\s*#{1,6}\s/.test(line));
  return truncateWorkText((content.some((line) => line.trim()) ? content : lines).map(plainMarkdownLine).filter(Boolean).join(" "));
}
