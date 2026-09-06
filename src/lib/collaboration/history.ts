import type { TaskMessagesPage } from "@/lib/db/workspaces.db";
import {
  isAdvisorTranscriptToolPart,
  selectAdvisorTranscriptExchanges,
  type AdvisorTranscriptExchange,
} from "./advisor-transcript";
import {
  isWorkerExchangeToolPart,
  selectWorkerExchanges,
  type WorkerExchange,
} from "./worker-exchanges";

export const COLLABORATION_HISTORY_PAGE_SIZE = 120;
/** A user-triggered export reads at most twenty persisted pages. */
export const COLLABORATION_EXPORT_MAX_MESSAGES = 2_400;
/** Keeps even unusually tool-dense transcripts to a reviewable report size. */
export const COLLABORATION_EXPORT_MAX_EXCHANGES = 500;

export interface CollaborationHistoryCoverage {
  firstMessageNumber: number;
  lastMessageNumber: number;
  scannedMessageCount: number;
  totalMessageCount: number;
  hasOlder: boolean;
  hasNewer: boolean;
}

export interface CollaborationHistoryPage {
  advisors: AdvisorTranscriptExchange[];
  workers: WorkerExchange[];
  coverage: CollaborationHistoryCoverage;
  advisorExchangeCount: number;
  workerExchangeCount: number;
  offset: number;
  limit: number;
}

export type CollaborationExportIncompleteReason =
  | "message-cap"
  | "exchange-cap"
  | "history-changed"
  | "empty-page";

export interface CollaborationHistoryExport {
  advisors: AdvisorTranscriptExchange[];
  workers: WorkerExchange[];
  coverage: {
    totalMessageCount: number;
    scannedMessageCount: number;
    advisorExchangeCount: number;
    workerExchangeCount: number;
    includedAdvisorExchangeCount: number;
    includedWorkerExchangeCount: number;
    complete: boolean;
    incompleteReasons: readonly CollaborationExportIncompleteReason[];
  };
}

export type CollaborationHistoryExportResult =
  | { status: "complete"; export: CollaborationHistoryExport }
  | { status: "cancelled" };

function countCollaborationExchanges(messages: TaskMessagesPage["messages"]) {
  let advisorExchangeCount = 0;
  let workerExchangeCount = 0;
  for (const message of messages) {
    for (const part of message.parts) {
      if (isAdvisorTranscriptToolPart(part)) advisorExchangeCount += 1;
      if (isWorkerExchangeToolPart(part)) workerExchangeCount += 1;
    }
  }
  return { advisorExchangeCount, workerExchangeCount };
}

/** Project one persisted transcript page and discard the full message payloads. */
export function projectCollaborationHistoryPage(
  page: TaskMessagesPage,
): CollaborationHistoryPage {
  const scannedMessageCount = page.messages.length;
  const lastMessageNumber = Math.max(page.totalCount - page.offset, 0);
  const firstMessageNumber = scannedMessageCount
    ? Math.max(lastMessageNumber - scannedMessageCount + 1, 1)
    : 0;
  const { advisorExchangeCount, workerExchangeCount } =
    countCollaborationExchanges(page.messages);

  const workers = selectWorkerExchanges(
    page.messages,
    COLLABORATION_HISTORY_PAGE_SIZE,
  ).map(({ toolUseId: _toolUseId, ...row }) => row);

  return {
    advisors: selectAdvisorTranscriptExchanges(
      page.messages,
      COLLABORATION_HISTORY_PAGE_SIZE,
    ),
    workers,
    coverage: {
      firstMessageNumber,
      lastMessageNumber,
      scannedMessageCount,
      totalMessageCount: page.totalCount,
      hasOlder: page.hasMoreOlder,
      hasNewer: page.offset > 0,
    },
    advisorExchangeCount,
    workerExchangeCount,
    offset: page.offset,
    limit: page.limit,
  };
}

/**
 * Read saved history only after the user requests an export. Full message
 * payloads are released after each page; only bounded collaboration excerpts
 * remain in the report projection.
 */
export async function collectCollaborationHistoryExport(args: {
  loadPage: (args: {
    limit: number;
    offset: number;
  }) => Promise<TaskMessagesPage>;
  isCancelled?: () => boolean;
  maxMessages?: number;
  maxExchanges?: number;
}): Promise<CollaborationHistoryExportResult> {
  const maxMessages = Math.max(
    1,
    args.maxMessages ?? COLLABORATION_EXPORT_MAX_MESSAGES,
  );
  const maxExchanges = Math.max(
    1,
    args.maxExchanges ?? COLLABORATION_EXPORT_MAX_EXCHANGES,
  );
  const advisors: AdvisorTranscriptExchange[] = [];
  const workers: WorkerExchange[] = [];
  const incompleteReasons = new Set<CollaborationExportIncompleteReason>();
  let offset = 0;
  let totalMessageCount: number | null = null;
  let scannedMessageCount = 0;
  let advisorExchangeCount = 0;
  let workerExchangeCount = 0;
  let hasMoreOlder = true;

  while (hasMoreOlder && scannedMessageCount < maxMessages) {
    if (args.isCancelled?.()) return { status: "cancelled" };
    const page = await args.loadPage({
      limit: Math.min(
        COLLABORATION_HISTORY_PAGE_SIZE,
        maxMessages - scannedMessageCount,
      ),
      offset,
    });
    if (args.isCancelled?.()) return { status: "cancelled" };

    if (totalMessageCount === null) {
      totalMessageCount = page.totalCount;
    } else if (page.totalCount !== totalMessageCount) {
      incompleteReasons.add("history-changed");
    }

    const pageMessageCount = page.messages.length;
    if (pageMessageCount === 0) {
      if (
        page.hasMoreOlder ||
        scannedMessageCount < (totalMessageCount ?? 0)
      ) {
        incompleteReasons.add("empty-page");
      }
      hasMoreOlder = false;
      break;
    }

    const pageCounts = countCollaborationExchanges(page.messages);
    advisorExchangeCount += pageCounts.advisorExchangeCount;
    workerExchangeCount += pageCounts.workerExchangeCount;
    const advisorSlots = Math.max(0, maxExchanges - advisors.length);
    const workerSlots = Math.max(0, maxExchanges - workers.length);
    if (pageCounts.advisorExchangeCount > advisorSlots) {
      incompleteReasons.add("exchange-cap");
    }
    if (pageCounts.workerExchangeCount > workerSlots) {
      incompleteReasons.add("exchange-cap");
    }
    if (advisorSlots) {
      advisors.push(
        ...selectAdvisorTranscriptExchanges(page.messages, advisorSlots),
      );
    }
    if (workerSlots) {
      workers.push(
        ...selectWorkerExchanges(page.messages, workerSlots).map(
          ({ toolUseId: _toolUseId, ...row }) => row,
        ),
      );
    }

    scannedMessageCount += pageMessageCount;
    offset += pageMessageCount;
    hasMoreOlder = page.hasMoreOlder;
  }

  if (hasMoreOlder && scannedMessageCount >= maxMessages) {
    incompleteReasons.add("message-cap");
  }
  const total = totalMessageCount ?? 0;
  const projectedAdvisors = mergeCollaborationRows([], advisors);
  const projectedWorkers = mergeCollaborationRows([], workers);
  return {
    status: "complete",
    export: {
      advisors: projectedAdvisors,
      workers: projectedWorkers,
      coverage: {
        totalMessageCount: total,
        scannedMessageCount,
        advisorExchangeCount,
        workerExchangeCount,
        includedAdvisorExchangeCount: projectedAdvisors.length,
        includedWorkerExchangeCount: projectedWorkers.length,
        complete: incompleteReasons.size === 0 && scannedMessageCount >= total,
        incompleteReasons: [...incompleteReasons],
      },
    },
  };
}

export function resolveOlderCollaborationHistoryOffset(
  page: CollaborationHistoryPage,
): number | null {
  if (!page.coverage.hasOlder || page.coverage.scannedMessageCount === 0)
    return null;
  return page.offset + page.coverage.scannedMessageCount;
}

export function resolveNewerCollaborationHistoryOffset(
  page: CollaborationHistoryPage,
): number | null {
  if (page.offset <= 0) return null;
  return Math.max(0, page.offset - page.limit);
}

export function mergeCollaborationRows<T extends { id: string }>(
  primary: readonly T[],
  secondary: readonly T[],
): T[] {
  const seen = new Set<string>();
  const rows: T[] = [];
  for (const row of [...primary, ...secondary]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    rows.push(row);
  }
  return rows;
}
