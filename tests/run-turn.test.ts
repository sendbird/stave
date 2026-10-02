import { describe, expect, test } from "bun:test";
import {
  loadRunTurnMessages,
  selectRunTurnMessages,
  type RunTurnMessagesPage,
} from "@/lib/reviews/run-turn";
import type { ChatMessage } from "@/types/chat";

function user(id: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return { id, role: "user", model: "", providerId: "user", content: id, parts: [], ...extra };
}

function assistant(id: string, turnId: string): ChatMessage {
  return { id, role: "assistant", model: "m", providerId: "claude-code", content: id, parts: [], turnId };
}

const ids = (messages: readonly ChatMessage[] | null) => messages?.map((message) => message.id) ?? null;

describe("selectRunTurnMessages", () => {
  const history = [
    user("u0"),
    assistant("a0", "t0"),
    user("u1"),
    assistant("a1", "t1"),
    user("s1", { steeredIntoTurnId: "t1" }),
    assistant("a1b", "t1"),
    user("u2"),
    assistant("a2", "t2"),
  ];

  test("pairs the run with the prompt right before it and keeps a steer inside it", () => {
    const selection = selectRunTurnMessages({ messages: history, turnId: "t1", startsAtBeginning: true });
    expect(selection.status).toBe("complete");
    expect(ids(selection.status === "missing" ? null : selection.messages)).toEqual(["u1", "a1", "s1", "a1b"]);
  });

  test("never takes a steer aimed at another run as this run's prompt", () => {
    const messages = [assistant("a0", "t0"), user("s0", { steeredIntoTurnId: "t0" }), assistant("a1", "t1")];
    const selection = selectRunTurnMessages({ messages, turnId: "t1", startsAtBeginning: true });
    expect(ids(selection.status === "missing" ? null : selection.messages)).toEqual(["a1"]);
  });

  test("a run that starts the window is incomplete unless the window starts the conversation", () => {
    const window = history.slice(3);
    expect(selectRunTurnMessages({ messages: window, turnId: "t1", startsAtBeginning: false }).status).toBe("incomplete");
    expect(selectRunTurnMessages({ messages: window, turnId: "t1", startsAtBeginning: true }).status).toBe("complete");
  });

  test("a run not in the window is missing", () => {
    expect(selectRunTurnMessages({ messages: history, turnId: "t9", startsAtBeginning: true })).toEqual({ status: "missing" });
  });
});

/** A paged loader over `history`, newest page first, recording every request. */
function pager(history: ChatMessage[]) {
  const requests: Array<{ limit: number; offset: number }> = [];
  const loadPage = async (args: { limit: number; offset: number }): Promise<RunTurnMessagesPage> => {
    requests.push(args);
    const end = Math.max(history.length - args.offset, 0);
    const start = Math.max(end - args.limit, 0);
    return { messages: history.slice(start, end), hasMoreOlder: start > 0 };
  };
  return { loadPage, requests };
}

describe("loadRunTurnMessages", () => {
  const history = [
    user("u0"),
    assistant("a0", "t0"),
    user("u1"),
    assistant("a1", "t1"),
    assistant("a1b", "t1"),
    user("u2"),
    assistant("a2", "t2"),
    user("u3"),
    assistant("a3", "t3"),
  ];

  test("reads older pages until the run and its prompt are both in hand", async () => {
    // Pages of 2 from the newest: [u3,a3] [u2,a2] [a1,a1b] [a0,u1] — the
    // prompt is a page older than the run's first row.
    const { loadPage, requests } = pager(history);
    const messages = await loadRunTurnMessages({ turnId: "t1", loadPage, pageSize: 2 });
    expect(ids(messages)).toEqual(["u1", "a1", "a1b"]);
    expect(requests.map((request) => request.offset)).toEqual([0, 2, 4, 6]);
  });

  test("stops at the first page that holds the whole run", async () => {
    const { loadPage, requests } = pager(history);
    expect(ids(await loadRunTurnMessages({ turnId: "t3", loadPage, pageSize: 4 }))).toEqual(["u3", "a3"]);
    expect(requests).toHaveLength(1);
  });

  test("a run that is not in the history reads every page once and returns null", async () => {
    const { loadPage, requests } = pager(history);
    expect(await loadRunTurnMessages({ turnId: "gone", loadPage, pageSize: 4 })).toBeNull();
    expect(requests.map((request) => request.offset)).toEqual([0, 4, 8]);
  });

  test("the page cap ends a scan and keeps what of the run it found", async () => {
    const { loadPage } = pager(history);
    expect(ids(await loadRunTurnMessages({ turnId: "t1", loadPage, pageSize: 2, maxPages: 3 }))).toEqual(["a1", "a1b"]);
  });
});
