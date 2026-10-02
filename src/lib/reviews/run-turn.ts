import type { ChatMessage } from "@/types/chat";

/**
 * One finished run's rows as the conversation showed them: the user message
 * that started it, then every row from the run's first message to its last.
 *
 * `incomplete` means the run's first row sits at the very start of a window
 * that is not the start of the conversation, so its prompt (or an earlier part
 * of the run) can still be in an older page.
 */
export type RunTurnSelection =
  | { status: "missing" }
  | { status: "incomplete"; messages: ChatMessage[] }
  | { status: "complete"; messages: ChatMessage[] };

/** A row the run produced, or a steer the user sent into it while it ran. */
function belongsToTurn(message: ChatMessage, turnId: string) {
  return message.turnId === turnId || message.steeredIntoTurnId === turnId;
}

/**
 * Selects one run from a contiguous, oldest-first window of a task's messages.
 *
 * The prompt is the user message immediately before the run's first row, the
 * same pairing the conversation uses for its stage dividers; a steer aimed at
 * another run is never taken as this run's prompt. Rows between the first and
 * last run row stay in, so a plan approval or a steer splitting the run reads
 * in order.
 */
export function selectRunTurnMessages(args: {
  messages: readonly ChatMessage[];
  turnId: string;
  /** Whether `messages` starts at the conversation's first message. */
  startsAtBeginning: boolean;
}): RunTurnSelection {
  const { messages, turnId } = args;
  let first = -1;
  let last = -1;
  for (let index = 0; index < messages.length; index += 1) {
    if (!belongsToTurn(messages[index]!, turnId)) continue;
    if (first < 0) first = index;
    last = index;
  }
  if (first < 0) return { status: "missing" };
  const before = first > 0 ? messages[first - 1] : undefined;
  const start =
    before && before.role === "user" && !before.steeredIntoTurnId
      ? first - 1
      : first;
  const rows = messages.slice(start, last + 1);
  return first > 0 || args.startsAtBeginning
    ? { status: "complete", messages: rows }
    : { status: "incomplete", messages: rows };
}

export interface RunTurnMessagesPage {
  /** Oldest first, ending `offset` rows before the newest message. */
  messages: ChatMessage[];
  hasMoreOlder: boolean;
}

export type LoadRunTurnMessagesPage = (args: {
  limit: number;
  offset: number;
}) => Promise<RunTurnMessagesPage>;

export const RUN_TURN_PAGE_SIZE = 200;
/** Bounds a scan of a very long conversation; 100 pages is 20,000 rows. */
export const RUN_TURN_MAX_PAGES = 100;

/**
 * Reads one run from saved history, newest page first, through the same paged
 * loader the conversation uses for "load older". Pages newer than the run are
 * dropped as soon as they are read, so memory holds the run and at most one
 * page, however far back it is. Null when the run is not in the history.
 */
export async function loadRunTurnMessages(args: {
  turnId: string;
  loadPage: LoadRunTurnMessagesPage;
  pageSize?: number;
  maxPages?: number;
}): Promise<ChatMessage[] | null> {
  const pageSize = args.pageSize ?? RUN_TURN_PAGE_SIZE;
  const maxPages = args.maxPages ?? RUN_TURN_MAX_PAGES;
  let offset = 0;
  let found: ChatMessage[] = [];
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const page = await args.loadPage({ limit: pageSize, offset });
    const selection = selectRunTurnMessages({
      messages: [...page.messages, ...found],
      turnId: args.turnId,
      startsAtBeginning: !page.hasMoreOlder,
    });
    if (selection.status === "complete") return selection.messages;
    // An incomplete run starts at this page's first row, so the next (older)
    // page joins it without a gap.
    found = selection.status === "incomplete" ? selection.messages : [];
    if (!page.hasMoreOlder || page.messages.length === 0) break;
    offset += page.messages.length;
  }
  return found.length > 0 ? found : null;
}
