/**
 * What a task turn said about opening a pull request, recorded while it
 * streams.
 *
 * Completed turns compact their tool events away (`sqlite-store.ts`), so
 * agent PR discovery cannot read them afterwards. Both provider paths in the
 * host (`startPushProviderTurn` and the local MCP task path) pass every event
 * through `observe`. Only two facts are kept per turn: whether a tool call ran
 * a PR-creating command, and which PR links the agent reported. Memory only,
 * bounded, like the discovery queue that reads it.
 */
import type { BridgeEvent } from "../providers/types";

const PR_CREATE_COMMANDS = [
  /\bgh\s+pr\s+create\b/,
  /\bhub\s+pull-request\b/,
];
const GH_API_PULLS = /\bgh\s+api\b[^\n]*\/pulls\b/;
const POST = /(?:-X|--method)\s*=?\s*POST\b|\s-[fF]\s/;
const PR_CREATE_TOOL = /create_?pull_?request|pull_?request_?create/i;
const PR_URL = /https:\/\/[A-Za-z0-9.-]+\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/\d+/g;
const START_GRACE_MS = 5_000;
const END_GRACE_MS = 60_000;
const MAX_TURNS = 200;
const MAX_AGE_MS = 30 * 60_000;
const MAX_URLS = 20;

export function normalizePullRequestUrl(url: string) {
  return url.toLowerCase();
}

export function pullRequestEvidenceOf(event: BridgeEvent): { createCommand: boolean; urls: string[] } {
  if (event.type === "tool") {
    const input = event.input ?? "";
    const createCommand = PR_CREATE_TOOL.test(event.toolName)
      || PR_CREATE_COMMANDS.some(pattern => pattern.test(input))
      || (GH_API_PULLS.test(input) && POST.test(input));
    // A creating command prints the new PR's link; other commands' output does not count.
    const urls = createCommand ? [...(event.output ?? "").matchAll(PR_URL)].map(match => normalizePullRequestUrl(match[0])) : [];
    return { createCommand, urls };
  }
  if (event.type === "text") return { createCommand: false, urls: [...event.text.matchAll(PR_URL)].map(match => normalizePullRequestUrl(match[0])) };
  return { createCommand: false, urls: [] };
}

interface TurnRecord {
  workspaceId: string;
  taskId: string;
  startedAt: number;
  completedAt: number | null;
  createCommand: boolean;
  urls: Set<string>;
}

export interface PullRequestCreator { taskId: string; turnId: string }

export function createTurnPullRequestEvidence(options: { now?: () => number } = {}) {
  const now = options.now ?? Date.now;
  const turns = new Map<string, TurnRecord>();
  function prune() {
    const cutoff = now() - MAX_AGE_MS;
    for (const [turnId, record] of turns) {
      if (turns.size <= MAX_TURNS && (record.completedAt ?? now()) >= cutoff) break;
      turns.delete(turnId);
    }
  }
  return {
    observe(args: { turnId: string; workspaceId: string; taskId: string; event: BridgeEvent }) {
      let record = turns.get(args.turnId);
      if (!record) {
        record = { workspaceId: args.workspaceId, taskId: args.taskId, startedAt: now(), completedAt: null, createCommand: false, urls: new Set() };
        turns.set(args.turnId, record);
        prune();
      }
      if (args.event.type === "done") { record.completedAt ??= now(); return; }
      const found = pullRequestEvidenceOf(args.event);
      record.createCommand ||= found.createCommand;
      for (const url of found.urls) if (record.urls.size < MAX_URLS) record.urls.add(url);
    },
    complete(turnId: string) {
      const record = turns.get(turnId);
      if (record) record.completedAt ??= now();
    },
    /** Whether the turn might have opened a PR at all; nothing else is worth a network read. */
    has(turnId: string) {
      const record = turns.get(turnId);
      return Boolean(record && (record.createCommand || record.urls.size));
    },
    /**
     * Turns in the workspace whose window contains the PR's creation and that
     * ran a creating command or reported this PR's link.
     */
    creators(args: { workspaceId: string; url: string; createdAt: string }): PullRequestCreator[] {
      const created = Date.parse(args.createdAt);
      const url = normalizePullRequestUrl(args.url);
      const found: PullRequestCreator[] = [];
      for (const [turnId, record] of turns) {
        if (record.workspaceId !== args.workspaceId) continue;
        const start = Math.floor(record.startedAt / 1_000) * 1_000 - START_GRACE_MS;
        const end = (record.completedAt ?? now()) + END_GRACE_MS;
        if (created < start || created > end) continue;
        if (record.createCommand || record.urls.has(url)) found.push({ taskId: record.taskId, turnId });
      }
      return found;
    },
  };
}

export type TurnPullRequestEvidence = ReturnType<typeof createTurnPullRequestEvidence>;

/** The host's single recorder, fed by both provider paths. */
export const turnPullRequestEvidence = createTurnPullRequestEvidence();
