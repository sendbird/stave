import { afterEach, describe, expect, test } from "bun:test";

import {
  CLAUDE_CONTEXT_USAGE_CACHE_MS,
  buildClaudeContextBreakdown,
  clearClaudeContextUsageCache,
  readClaudeContextUsageCached,
} from "@/lib/providers/claude-context-breakdown";
import type {
  ClaudeContextUsageResponse,
  ClaudeContextUsageSnapshot,
} from "@/lib/providers/provider.types";

const snapshot: ClaudeContextUsageSnapshot = {
  categories: [
    { id: "skills", name: "Skills", tokens: 1_100, color: "yellow", kind: "used" },
    { id: "system_prompt", name: "System prompt", tokens: 3_100, color: "gray", kind: "used" },
    { id: "system_tools", name: "System tools", tokens: 12_400, color: "gray", kind: "used" },
    { id: "mcp_tools", name: "MCP tools", tokens: 8_200, color: "cyan", kind: "used" },
    { id: "mcp_tools_deferred", name: "Deferred", tokens: 4_000, color: "cyan", kind: "deferred", isDeferred: true },
    { id: "memory_files", name: "Memory files", tokens: 2_300, color: "orange", kind: "used" },
    { id: "messages", name: "Messages", tokens: 40, color: "purple", kind: "used" },
    { id: "autocompact_buffer", name: "Buffer", tokens: 13_000, color: "gray", kind: "buffer" },
    { id: "free_space", name: "Free", tokens: 50_000, color: "gray", kind: "free" },
    { name: "Plugin hooks", tokens: 500, color: "red", kind: "used" },
  ],
  totalTokens: 27_640,
  maxTokens: 100_000,
  rawMaxTokens: 100_000,
  percentage: 28,
  model: "claude-test",
  memoryFiles: [
    { path: "/tmp/workspace/CLAUDE.md", type: "Project", tokens: 1_600 },
    { path: "/tmp/home/.claude/CLAUDE.md", type: "User", tokens: 700 },
  ],
  mcpTools: [
    { name: "search", serverName: "docs", tokens: 5_000 },
    { name: "fetch", serverName: "docs", tokens: 3_200 },
    { name: "deferred_tool", serverName: "docs", tokens: 900, isLoaded: false },
  ],
};

afterEach(() => clearClaudeContextUsageCache());

describe("buildClaudeContextBreakdown", () => {
  test("lists the fixed parts in reading order and leaves out conversation, room and deferred tools", () => {
    const breakdown = buildClaudeContextBreakdown(snapshot, 72_000);
    expect(breakdown.rows.map((row) => row.id)).toEqual([
      "system_prompt",
      "system_tools",
      "mcp_tools",
      "memory_files",
      "skills",
      "sdk:Plugin hooks",
    ]);
    expect(breakdown.fixedTokens).toBe(3_100 + 12_400 + 8_200 + 2_300 + 1_100 + 500);
  });

  test("estimates the conversation as used tokens minus the fixed parts", () => {
    expect(buildClaudeContextBreakdown(snapshot, 72_000).conversationTokens).toBe(72_000 - 27_600);
  });

  test("gives no estimate without a used count or when the fixed parts exceed it", () => {
    expect(buildClaudeContextBreakdown(snapshot, undefined).conversationTokens).toBeNull();
    expect(buildClaudeContextBreakdown(snapshot, 10_000).conversationTokens).toBeNull();
  });

  test("expands MCP tools (loaded only) and memory files", () => {
    const rows = buildClaudeContextBreakdown(snapshot, 72_000).rows;
    const mcp = rows.find((row) => row.id === "mcp_tools");
    expect(mcp?.items?.map((item) => [item.label, item.detail, item.tokens])).toEqual([
      ["search", "docs", 5_000],
      ["fetch", "docs", 3_200],
    ]);
    const memory = rows.find((row) => row.id === "memory_files");
    expect(memory?.items?.map((item) => [item.label, item.detail])).toEqual([
      ["CLAUDE.md", "/tmp/workspace/CLAUDE.md"],
      ["CLAUDE.md", "/tmp/home/.claude/CLAUDE.md"],
    ]);
    expect(rows.find((row) => row.id === "skills")?.items).toBeUndefined();
  });
});

describe("readClaudeContextUsageCached", () => {
  const ok: ClaudeContextUsageResponse = { ok: true, detail: "loaded", usage: snapshot };

  test("shares one in-flight read and reuses it inside the cache window", async () => {
    let calls = 0;
    const load = async () => {
      calls += 1;
      return ok;
    };
    const first = readClaudeContextUsageCached("task:model", load, 1_000);
    const second = readClaudeContextUsageCached("task:model", load, 1_001);
    expect(second).toBe(first);
    await first;
    await readClaudeContextUsageCached("task:model", load, 1_000 + CLAUDE_CONTEXT_USAGE_CACHE_MS - 1);
    expect(calls).toBe(1);
    await readClaudeContextUsageCached("task:model", load, 1_000 + CLAUDE_CONTEXT_USAGE_CACHE_MS);
    expect(calls).toBe(2);
  });

  test("keys reads apart", async () => {
    let calls = 0;
    const load = async () => {
      calls += 1;
      return ok;
    };
    await readClaudeContextUsageCached("task-a", load, 0);
    await readClaudeContextUsageCached("task-b", load, 0);
    expect(calls).toBe(2);
  });

  test("caches a failure too, so reopening cannot retry in a loop", async () => {
    let calls = 0;
    const load = async (): Promise<ClaudeContextUsageResponse> => {
      calls += 1;
      throw new Error("runtime unavailable");
    };
    const result = await readClaudeContextUsageCached("broken", load, 0);
    expect(result).toEqual({ ok: false, detail: "runtime unavailable" });
    await readClaudeContextUsageCached("broken", load, 10);
    expect(calls).toBe(1);
  });
});
