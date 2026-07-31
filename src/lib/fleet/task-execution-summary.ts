import type {
  ProviderId,
  RateLimitsSnapshotResponse,
} from "@/lib/providers/provider.types";
import type { ProviderTurnActivitySnapshot } from "@/lib/providers/turn-status";
import type { TurnVerificationResult } from "@/lib/workspace-scripts";
import type { ChatMessage, CodeDiffPart } from "@/types/chat";

export type TaskExecutionMetricProvenance =
  | "reported"
  | "derived"
  | "unavailable";

export interface TaskExecutionMetric<T> {
  value: T | null;
  provenance: TaskExecutionMetricProvenance;
  detail?: string;
  sourceRefs: string[];
}

export interface TaskExecutionElapsed {
  milliseconds: number;
  running: boolean;
}

export interface TaskExecutionLatestActivity {
  label: string;
  detail?: string;
  occurredAt?: number;
}

export interface TaskExecutionChanges {
  files: string[];
  additions: number | null;
  deletions: number | null;
  partial: boolean;
}

export interface TaskExecutionUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalCostUsd: number | null;
}

export interface TaskExecutionAccountLimit {
  providerId: ProviderId;
  label: string;
  usedPercent: number;
  resetsAt: number | null;
}

export interface TaskExecutionContextHeadroom {
  remainingTokens: number;
  totalTokens?: number;
}

export interface TaskExecutionSummary {
  elapsed: TaskExecutionMetric<TaskExecutionElapsed>;
  latestActivity: TaskExecutionMetric<TaskExecutionLatestActivity>;
  changes: TaskExecutionMetric<TaskExecutionChanges>;
  verification: TaskExecutionMetric<TurnVerificationResult>;
  usage: TaskExecutionMetric<TaskExecutionUsage>;
  accountLimit: TaskExecutionMetric<TaskExecutionAccountLimit>;
  contextHeadroom: TaskExecutionMetric<TaskExecutionContextHeadroom>;
}

export interface TaskReviewArtifact {
  headline: string;
  facts: string[];
  cautions: string[];
  sourceRefs: string[];
}

const MAX_DIFF_CONTENT_LENGTH = 250_000;
const MAX_DIFF_LCS_CELL_COUNT = 4_000_000;
const MAX_ACTIVITY_TEXT_LENGTH = 240;

function unavailableMetric<T>(detail: string): TaskExecutionMetric<T> {
  return {
    value: null,
    provenance: "unavailable",
    detail,
    sourceRefs: [],
  };
}

function parseTimestamp(value?: string) {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function boundActivityText(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= MAX_ACTIVITY_TEXT_LENGTH
    ? normalized
    : `${normalized.slice(0, MAX_ACTIVITY_TEXT_LENGTH - 1).trimEnd()}…`;
}

function findLatestAssistantMessage(messages: readonly ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant") {
      return message;
    }
  }
  return null;
}

function buildElapsedMetric(args: {
  messages: readonly ChatMessage[];
  activity?: ProviderTurnActivitySnapshot | null;
  now: number;
}): TaskExecutionMetric<TaskExecutionElapsed> {
  if (args.activity) {
    const completedAt = args.activity.completedAt ?? args.now;
    return {
      value: {
        milliseconds: Math.max(0, completedAt - args.activity.startedAt),
        running: args.activity.completedAt == null,
      },
      provenance: "reported",
      sourceRefs: [`turn:${args.activity.turnId}`],
    };
  }

  const message = findLatestAssistantMessage(args.messages);
  const startedAt = parseTimestamp(message?.startedAt);
  if (message && startedAt != null) {
    const completedAt = parseTimestamp(message.completedAt);
    if (completedAt == null && !message.isStreaming) {
      return unavailableMetric(
        "The persisted assistant message has no completion timestamp.",
      );
    }
    return {
      value: {
        milliseconds: Math.max(0, (completedAt ?? args.now) - startedAt),
        running: completedAt == null,
      },
      provenance: "derived",
      detail: "Derived from persisted assistant message timestamps.",
      sourceRefs: [`message:${message.id}`],
    };
  }

  return unavailableMetric("The provider did not report turn timing.");
}

function summarizeMessageActivity(message: ChatMessage) {
  for (let index = message.parts.length - 1; index >= 0; index -= 1) {
    const part = message.parts[index];
    if (part?.type === "system_event" && part.content.trim()) {
      return boundActivityText(part.content);
    }
    if (part?.type === "tool_use") {
      return boundActivityText(
        `${part.toolName}${part.output?.trim() ? ` · ${part.output.trim()}` : ""}`,
      );
    }
    if (part?.type === "approval") {
      const label =
        part.state === "approval-requested"
          ? "Waiting for approval"
          : part.state === "approval-responded"
            ? "Approval answered"
            : part.state === "output-denied"
              ? "Approval denied"
              : "Approval interrupted";
      return boundActivityText(
        `${label} · ${part.toolName}: ${part.description}`,
      );
    }
    if (part?.type === "user_input") {
      const label =
        part.state === "input-requested"
          ? "Waiting for your answer"
          : part.state === "input-responded"
            ? "Question answered"
            : part.state === "input-denied"
              ? "Question declined"
              : "Question interrupted";
      const question = part.questions[0]?.question.trim();
      return boundActivityText(
        `${label} · ${question || part.toolName}`,
      );
    }
    if (part?.type === "text" && part.text.trim()) {
      return boundActivityText(part.text);
    }
  }
  return boundActivityText(message.content);
}

function buildLatestActivityMetric(args: {
  messages: readonly ChatMessage[];
  activity?: ProviderTurnActivitySnapshot | null;
}): TaskExecutionMetric<TaskExecutionLatestActivity> {
  const activity = args.activity;
  if (activity?.pendingInteraction) {
    return {
      value: {
        label:
          activity.pendingInteraction === "approval"
            ? "Waiting for approval"
            : "Waiting for your answer",
        occurredAt: activity.lastEventAt,
      },
      provenance: "reported",
      sourceRefs: [`turn:${activity.turnId}`],
    };
  }
  if (activity?.turnError) {
    return {
      value: {
        label: "Run failed",
        detail: boundActivityText(activity.turnError),
        occurredAt: activity.completedAt ?? activity.lastEventAt,
      },
      provenance: "reported",
      sourceRefs: [`turn:${activity.turnId}`],
    };
  }
  if (activity) {
    for (
      let index = activity.orderedWorkItemIds.length - 1;
      index >= 0;
      index -= 1
    ) {
      const itemId = activity.orderedWorkItemIds[index];
      const item = itemId ? activity.workItemsById[itemId] : undefined;
      if (item) {
        return {
          value: {
            label: item.title,
            detail: boundActivityText(
              item.detail ?? item.progressMessages.at(-1) ?? "",
            ) || undefined,
            occurredAt: item.updatedAt,
          },
          provenance: "reported",
          sourceRefs: [`turn:${activity.turnId}`, `work-item:${item.id}`],
        };
      }
    }
  }

  const message = findLatestAssistantMessage(args.messages);
  const detail = message ? summarizeMessageActivity(message) : "";
  if (message && detail) {
    return {
      value: {
        label: detail,
        occurredAt:
          parseTimestamp(message.completedAt) ??
          parseTimestamp(message.startedAt) ??
          undefined,
      },
      provenance: "derived",
      detail: "Derived from the latest persisted assistant message.",
      sourceRefs: [`message:${message.id}`],
    };
  }

  return unavailableMetric("No meaningful provider activity was reported.");
}

function splitLines(value: string) {
  if (!value) {
    return [];
  }
  const lines = value.split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
}

function countChangedLines(oldContent: string, newContent: string) {
  const oldLines = splitLines(oldContent);
  const newLines = splitLines(newContent);
  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - suffix - 1] ===
      newLines[newLines.length - suffix - 1]
  ) {
    suffix += 1;
  }
  const oldMiddle = oldLines.slice(prefix, oldLines.length - suffix);
  const newMiddle = newLines.slice(prefix, newLines.length - suffix);
  if (oldMiddle.length === 0 || newMiddle.length === 0) {
    return {
      additions: newMiddle.length,
      deletions: oldMiddle.length,
    };
  }
  if (
    oldMiddle.length * newMiddle.length >
    MAX_DIFF_LCS_CELL_COUNT
  ) {
    return null;
  }

  let previous = new Uint32Array(newMiddle.length + 1);
  let current = new Uint32Array(newMiddle.length + 1);
  for (const oldLine of oldMiddle) {
    for (let index = 1; index <= newMiddle.length; index += 1) {
      current[index] =
        oldLine === newMiddle[index - 1]
          ? previous[index - 1]! + 1
          : Math.max(previous[index]!, current[index - 1]!);
    }
    [previous, current] = [current, previous];
    current.fill(0);
  }
  const commonLineCount = previous[newMiddle.length] ?? 0;
  return {
    additions: newMiddle.length - commonLineCount,
    deletions: oldMiddle.length - commonLineCount,
  };
}

function collectCodeDiffs(messages: readonly ChatMessage[]) {
  const byPath = new Map<
    string,
    {
      first: CodeDiffPart;
      last: CodeDiffPart;
      messageIds: Set<string>;
    }
  >();
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== "code_diff") {
        continue;
      }
      const current = byPath.get(part.filePath);
      if (current) {
        current.last = part;
        current.messageIds.add(message.id);
      } else {
        byPath.set(part.filePath, {
          first: part,
          last: part,
          messageIds: new Set([message.id]),
        });
      }
    }
  }
  return byPath;
}

function buildChangesMetric(
  messages: readonly ChatMessage[],
): TaskExecutionMetric<TaskExecutionChanges> {
  const diffs = collectCodeDiffs(messages);
  if (diffs.size === 0) {
    return unavailableMetric("No code diff was reported for this task.");
  }

  let additions = 0;
  let deletions = 0;
  let partial = false;
  const sourceRefs = new Set<string>();
  for (const { first, last, messageIds } of diffs.values()) {
    for (const messageId of messageIds) {
      sourceRefs.add(`message:${messageId}`);
    }
    if (
      first.oldContent.length + last.newContent.length >
      MAX_DIFF_CONTENT_LENGTH
    ) {
      partial = true;
      continue;
    }
    const counts = countChangedLines(first.oldContent, last.newContent);
    if (!counts) {
      partial = true;
      continue;
    }
    additions += counts.additions;
    deletions += counts.deletions;
  }

  return {
    value: {
      files: [...diffs.keys()],
      additions: partial ? null : additions,
      deletions: partial ? null : deletions,
      partial,
    },
    provenance: "derived",
    detail: partial
      ? "File paths are complete; line totals are unavailable for oversized diffs."
      : "Line totals are derived from the first and latest reported diff per file.",
    sourceRefs: [...sourceRefs],
  };
}

function buildUsageMetric(
  messages: readonly ChatMessage[],
): TaskExecutionMetric<TaskExecutionUsage> {
  const withUsage = messages.filter((message) => message.usage);
  if (withUsage.length === 0) {
    return unavailableMetric("The provider did not report token or cost usage.");
  }
  const value = withUsage.reduce<TaskExecutionUsage>(
    (total, message) => {
      const usage = message.usage;
      if (!usage) {
        return total;
      }
      total.inputTokens += usage.inputTokens;
      total.outputTokens += usage.outputTokens;
      total.cacheReadTokens += usage.cacheReadTokens ?? 0;
      total.cacheCreationTokens += usage.cacheCreationTokens ?? 0;
      if (usage.totalCostUsd != null) {
        total.totalCostUsd =
          (total.totalCostUsd ?? 0) + usage.totalCostUsd;
      }
      return total;
    },
    {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      totalCostUsd: null,
    },
  );
  return {
    value,
    provenance: "reported",
    detail: `Cumulative usage from ${withUsage.length} persisted message${withUsage.length === 1 ? "" : "s"}.`,
    sourceRefs: withUsage.map((message) => `message:${message.id}`),
  };
}

function resolveClaudeAccountLimit(
  snapshot: RateLimitsSnapshotResponse,
): TaskExecutionAccountLimit | null {
  if (snapshot.claude.source === "unavailable") {
    return null;
  }
  const candidates = [
    ["Session", snapshot.claude.session],
    ["Weekly", snapshot.claude.weekly],
    ["Model weekly", snapshot.claude.fableWeekly],
  ] as const;
  const mostUsed = candidates
    .flatMap(([label, window]) => (window ? [{ label, window }] : []))
    .sort(
      (left, right) => right.window.usedPercent - left.window.usedPercent,
    )[0];
  return mostUsed
    ? {
        providerId: "claude-code",
        label: mostUsed.label,
        usedPercent: mostUsed.window.usedPercent,
        resetsAt: mostUsed.window.resetsAt,
      }
    : null;
}

function resolveCodexAccountLimit(
  snapshot: RateLimitsSnapshotResponse,
): TaskExecutionAccountLimit | null {
  if (snapshot.codex.source === "unavailable") {
    return null;
  }
  const candidates: Array<TaskExecutionAccountLimit> = [];
  for (const bucket of snapshot.codex.buckets) {
    const label = bucket.limitName?.trim() || bucket.limitId?.trim() || "Codex";
    if (bucket.primary) {
      candidates.push({
        providerId: "codex",
        label: `${label} primary`,
        usedPercent: bucket.primary.usedPercent,
        resetsAt: bucket.primary.resetsAt,
      });
    }
    if (bucket.secondary) {
      candidates.push({
        providerId: "codex",
        label: `${label} secondary`,
        usedPercent: bucket.secondary.usedPercent,
        resetsAt: bucket.secondary.resetsAt,
      });
    }
    if (bucket.individualLimit) {
      candidates.push({
        providerId: "codex",
        label,
        usedPercent: bucket.individualLimit.usedPercent,
        resetsAt: bucket.individualLimit.resetsAt,
      });
    }
  }
  return candidates.sort(
    (left, right) => right.usedPercent - left.usedPercent,
  )[0] ?? null;
}

function buildAccountLimitMetric(args: {
  providerId: ProviderId;
  rateLimits?: RateLimitsSnapshotResponse | null;
}): TaskExecutionMetric<TaskExecutionAccountLimit> {
  if (!args.rateLimits) {
    return unavailableMetric("Account limit data has not been loaded.");
  }
  const value =
    args.providerId === "claude-code"
      ? resolveClaudeAccountLimit(args.rateLimits)
      : resolveCodexAccountLimit(args.rateLimits);
  return value
    ? {
        value,
        provenance: "reported",
        sourceRefs: [`account-limit:${args.providerId}`],
      }
    : unavailableMetric(
        `${args.providerId === "claude-code" ? "Claude" : "Codex"} did not report an account limit.`,
      );
}

export function buildTaskExecutionSummary(args: {
  taskId?: string;
  providerId: ProviderId;
  messages: readonly ChatMessage[];
  activity?: ProviderTurnActivitySnapshot | null;
  verification?: TurnVerificationResult | null;
  rateLimits?: RateLimitsSnapshotResponse | null;
  contextHeadroom?: TaskExecutionContextHeadroom | null;
  now?: number;
}): TaskExecutionSummary {
  const verification =
    args.verification &&
    (!args.verification.taskId ||
      !args.taskId ||
      args.verification.taskId === args.taskId)
      ? {
          value: args.verification,
          provenance: "reported" as const,
          sourceRefs: [
            `verification:${args.verification.turnId ?? args.verification.completedAt}`,
          ],
        }
      : unavailableMetric<TurnVerificationResult>(
          "No verification result was reported for this task.",
        );
  return {
    elapsed: buildElapsedMetric({
      messages: args.messages,
      activity: args.activity,
      now: args.now ?? Date.now(),
    }),
    latestActivity: buildLatestActivityMetric({
      messages: args.messages,
      activity: args.activity,
    }),
    changes: buildChangesMetric(args.messages),
    verification,
    usage: buildUsageMetric(args.messages),
    accountLimit: buildAccountLimitMetric({
      providerId: args.providerId,
      rateLimits: args.rateLimits,
    }),
    contextHeadroom: args.contextHeadroom
      ? {
          value: args.contextHeadroom,
          provenance: "reported",
          sourceRefs: [`context:${args.providerId}`],
        }
      : unavailableMetric(
          "Live context headroom is not reliably reported for this provider turn.",
        ),
  };
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

export function buildTaskReviewArtifact(
  summary: TaskExecutionSummary,
): TaskReviewArtifact {
  const facts: string[] = [];
  const cautions: string[] = [];
  const changes = summary.changes.value;
  if (changes) {
    const lineCounts =
      changes.additions == null || changes.deletions == null
        ? ""
        : ` (+${changes.additions}/−${changes.deletions})`;
    facts.push(
      `${changes.files.length} changed file${changes.files.length === 1 ? "" : "s"}${lineCounts}`,
    );
    if (changes.partial) {
      cautions.push("Line totals are unavailable for oversized diffs.");
    }
  } else {
    cautions.push("No changed-file artifact was reported.");
  }
  const verification = summary.verification.value;
  if (verification) {
    facts.push(
      `Verification ${verification.status}: ${verification.executedEntries}/${verification.totalEntries} checks`,
    );
  } else {
    cautions.push("Verification was not reported.");
  }
  const usage = summary.usage.value;
  if (usage) {
    facts.push(
      `${formatCount(usage.inputTokens + usage.outputTokens)} tokens${usage.totalCostUsd == null ? "" : ` · $${usage.totalCostUsd.toFixed(4)}`}`,
    );
  }
  if (!summary.contextHeadroom.value) {
    cautions.push("Live context headroom is unavailable.");
  }
  const latest = summary.latestActivity.value?.label;
  return {
    headline: latest || "Task run completed",
    facts,
    cautions,
    sourceRefs: [
      ...new Set(
        Object.values(summary).flatMap((metric) => metric.sourceRefs),
      ),
    ].slice(0, 32),
  };
}

export function formatTaskReviewArtifactCompact(artifact: TaskReviewArtifact) {
  const facts = artifact.facts.slice(0, 2);
  return [artifact.headline, ...facts].join(" · ").slice(0, 240);
}
