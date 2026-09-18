import { describe, expect, test } from "bun:test";
import {
  AgentHistoryRequestSchema,
  boundHistoryEntries,
  historyText,
  mapAgentHistory,
} from "../src/lib/providers/agent-history";

/**
 * The agent-history reader turns a saved subagent/thread transcript into inert,
 * bounded text for a read-only detail dialog. These guards cover the parts that
 * are correctness- and safety-sensitive: transcripts are never executed or
 * interpreted, redacted content is dropped, oversized entries are truncated,
 * and the request contract rejects malformed input before it can reach a
 * provider read.
 */
describe("agent-history request contract", () => {
  test("applies offset/limit defaults and accepts a valid request", () => {
    const parsed = AgentHistoryRequestSchema.parse({
      providerId: "codex",
      sessionId: "s1",
      agentId: "thread-1",
      cwd: "/tmp/project",
    });
    expect(parsed.offset).toBe(0);
    expect(parsed.limit).toBe(50);
  });

  test("rejects unknown providers and extra keys", () => {
    expect(
      AgentHistoryRequestSchema.safeParse({
        providerId: "cursor-agent",
        sessionId: "s1",
        agentId: "a1",
        cwd: "/tmp/project",
      }).success,
    ).toBe(false);
    expect(
      AgentHistoryRequestSchema.safeParse({
        providerId: "codex",
        sessionId: "s1",
        agentId: "a1",
        cwd: "/tmp/project",
        extra: true,
      }).success,
    ).toBe(false);
  });

  test("caps the page size so a single read cannot pull an unbounded window", () => {
    expect(
      AgentHistoryRequestSchema.safeParse({
        providerId: "claude-code",
        sessionId: "s1",
        agentId: "a1",
        cwd: "/tmp/project",
        limit: 101,
      }).success,
    ).toBe(false);
  });
});

describe("historyText keeps transcripts inert", () => {
  test("returns plain strings unchanged", () => {
    expect(historyText("hello")).toBe("hello");
  });

  test("drops redacted thinking and reads thinking text", () => {
    expect(historyText({ type: "redacted_thinking" })).toBe("");
    expect(historyText({ type: "thinking", thinking: "reasoning" })).toBe(
      "reasoning",
    );
  });

  test("joins array content and serializes unknown shapes as data, not code", () => {
    expect(
      historyText([{ text: "a" }, { text: "b" }, { type: "redacted_thinking" }]),
    ).toBe("a\nb");
    expect(historyText({ foo: 1 })).toBe(JSON.stringify({ foo: 1 }, null, 2));
  });
});

describe("mapAgentHistory", () => {
  test("maps claude subagent messages with reported model", () => {
    const entries = mapAgentHistory("claude-code", [
      {
        uuid: "m1",
        type: "assistant",
        message: { model: "claude-x", content: [{ text: "done" }] },
      },
    ]);
    expect(entries).toEqual([
      { id: "m1", title: "assistant", text: "done", model: "claude-x" },
    ]);
  });

  test("flattens codex thread turns into per-item entries", () => {
    const entries = mapAgentHistory("codex", {
      turns: [
        { id: "t1", items: [{ id: "i1", type: "message", text: "hi" }] },
      ],
    });
    expect(entries).toEqual([{ id: "t1:i1", title: "message", text: "hi" }]);
  });

  test("tolerates missing arrays without throwing", () => {
    expect(mapAgentHistory("claude-code", null)).toEqual([]);
    expect(mapAgentHistory("codex", {})).toEqual([]);
  });
});

describe("boundHistoryEntries", () => {
  test("truncates entries longer than the persisted-event ceiling", () => {
    const [entry] = boundHistoryEntries([
      { id: "1", title: "t", text: "x".repeat(64_001) },
    ]);
    expect(entry.truncated).toBe(true);
    expect(entry.text.length).toBe(64_000);
  });

  test("leaves in-bounds entries untouched", () => {
    const [entry] = boundHistoryEntries([{ id: "1", title: "t", text: "ok" }]);
    expect(entry.truncated).toBeUndefined();
    expect(entry.text).toBe("ok");
  });
});
