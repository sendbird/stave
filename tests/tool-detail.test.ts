import { describe, expect, test } from "bun:test";
import { buildCodexCommandInput } from "../electron/providers/codex-command-result";
import { mapClaudeMessageToEvents } from "../electron/providers/claude-event-mapping";
import { normalizeToolDetailInput, normalizeToolDetailOutput } from "@/lib/tool-detail";

describe("tool details", () => {
  test("reads range arguments from Claude SDK tool_use and matches from tool_result text blocks", () => {
    const [read, grep] = mapClaudeMessageToEvents({
      claudeDebugStream: false,
      message: {
        type: "assistant",
        message: { content: [
          { type: "tool_use", id: "read", name: "Read", input: { file_path: "/repo/source file.ts", offset: 14, limit: 5, allow_large: true } },
          { type: "tool_use", id: "grep", name: "Grep", input: { path: "/repo/source file.ts", output_mode: "content" } },
        ] },
      } as Parameters<typeof mapClaudeMessageToEvents>[0]["message"],
    });
    if (read?.type !== "tool" || grep?.type !== "tool") throw new Error("expected tool events");
    expect(normalizeToolDetailInput(read.toolName.toLowerCase(), read.input)).toEqual({
      read: { path: "/repo/source file.ts", line: 14, offset: 14, limit: 5 },
      remainingInput: '{\n  "allow_large": true\n}',
    });
    const [result] = mapClaudeMessageToEvents({
      claudeDebugStream: false,
      message: {
        type: "user",
        message: { content: [{
          type: "tool_result", tool_use_id: "grep",
          content: [{ type: "text", text: "14:match:with colon" }, { type: "text", text: "19:second match" }],
        }] },
      } as Parameters<typeof mapClaudeMessageToEvents>[0]["message"],
    });
    if (result?.type !== "tool_result") throw new Error("expected tool result");
    expect(normalizeToolDetailOutput(result.output, normalizeToolDetailInput("grep", grep.input).search)).toEqual({
      kind: "matches", hidden: 0,
      matches: [
        { path: "/repo/source file.ts", line: 14, snippet: "match:with colon" },
        { path: "/repo/source file.ts", line: 19, snippet: "second match" },
      ],
    });
  });

  test("uses Codex command item actions without guessing ranges or splitting shared stdout", () => {
    const read = buildCodexCommandInput({
      command: "sed -n '2,5p' app.ts",
      cwd: "/repo/nested",
      commandActions: [{ type: "read", command: "sed -n '2,5p' app.ts", name: "app.ts", path: "app.ts" }],
    });
    expect(normalizeToolDetailInput("bash", read)).toEqual({
      command: "sed -n '2,5p' app.ts", read: { path: "/repo/nested/app.ts" }, remainingInput: null,
    });
    const search = normalizeToolDetailInput("bash", buildCodexCommandInput({
      command: "rg -n --with-filename value",
      cwd: "/repo/nested",
      commandActions: [{ type: "search", query: "value", path: null }],
    })).search;
    expect(normalizeToolDetailOutput("\x1b[31m./app.ts\x1b[0m:4:value", search)).toEqual({
      kind: "matches", hidden: 0, matches: [{ path: "/repo/nested/app.ts", line: 4, snippet: "value" }],
    });
    const singleFile = normalizeToolDetailInput("bash", buildCodexCommandInput({
      command: "rg -n value app.ts",
      cwd: "/repo/nested",
      commandActions: [{ type: "search", query: "value", path: "app.ts" }],
    })).search;
    const expectedMatch = { kind: "matches", matches: [{ path: "/repo/nested/app.ts", line: 4 }] };
    expect(normalizeToolDetailOutput("4:value", singleFile)).toMatchObject(expectedMatch);
    expect(normalizeToolDetailOutput('{"content":[{"type":"text","text":"4:value"}]}', singleFile))
      .toMatchObject(expectedMatch);
    const list = normalizeToolDetailInput("bash", buildCodexCommandInput({
      command: "rg --files",
      cwd: "/repo",
      commandActions: [{ type: "listFiles", path: null }],
    })).search;
    expect(normalizeToolDetailOutput("Makefile\nsrc/index.ts", list)).toMatchObject({
      kind: "matches", matches: [{ path: "/repo/Makefile" }, { path: "/repo/src/index.ts" }],
    });
    expect(buildCodexCommandInput({ command: "compound", commandActions: [{ type: "read" }, { type: "search" }] })).toBe("compound");
    expect(normalizeToolDetailInput("bash", "echo legacy")).toEqual({ command: "echo legacy" });
  });

  test("handles explicit Read ranges, zero offsets and malformed arguments", () => {
    expect(normalizeToolDetailInput("files:read", '{"path":"src/log.log","startLine":4,"endLine":9}').read)
      .toMatchObject({ path: "src/log.log", line: 4, endLine: 9 });
    expect(normalizeToolDetailInput("read", '{"path":"notes.txt","offset":0,"limit":-1}'))
      .toMatchObject({ read: { line: 1, offset: 0, limit: undefined }, remainingInput: '{\n  "limit": -1\n}' });
    expect(normalizeToolDetailInput("read", '{"path":')).toEqual({});
    expect(normalizeToolDetailInput("read", '{"path":false}')).toEqual({});
  });

  test("caps matches, accepts file listings and keeps mixed or count output intact", () => {
    const matches = Array.from({ length: 54 }, (_, index) => `src/example.ts:${index + 1}:match`).join("\n");
    const detail = normalizeToolDetailOutput(matches, { kind: "grep" });
    if (detail.kind !== "matches") throw new Error("expected matches");
    expect(detail.matches).toHaveLength(50);
    expect(detail.hidden).toBe(4);
    expect(normalizeToolDetailOutput("Found 2 files\nsrc/a.ts\nfile with spaces.ts", { kind: "grep" }))
      .toMatchObject({ kind: "matches", matches: [{ path: "src/a.ts" }, { path: "file with spaces.ts" }] });
    for (const output of ["src/a.ts:2:match\nunknown diagnostic", "src/a.ts:0:invalid line", "https://host/a.ts:14:text"]) {
      expect(normalizeToolDetailOutput(output, { kind: "grep" })).toEqual({ kind: "text", text: output, truncated: false });
    }
    expect(normalizeToolDetailOutput("src/a.ts:50", { kind: "grep", countOnly: true }))
      .toMatchObject({ kind: "text" });
  });

  test("normalizes plain and MCP-wrapped JSON and bounds deeply nested or wide payloads", () => {
    const json = '{"status":["ready",true]}';
    const embedded = JSON.stringify({ content: [{ type: "text", text: json }] });
    const structured = JSON.stringify({ content: [{ type: "text", text: "Ready" }], structuredContent: JSON.parse(json) });
    const detail = normalizeToolDetailOutput(json);
    expect(detail).toMatchObject({ kind: "json", root: { children: [{ key: "status", array: true }] } });
    expect(normalizeToolDetailOutput(embedded)).toEqual(detail);
    expect(normalizeToolDetailOutput(structured)).toEqual(detail);
    expect(normalizeToolDetailOutput("[broken")).toEqual({ kind: "text", text: "[broken", truncated: false });
    expect(normalizeToolDetailOutput(JSON.stringify(Array(450).fill(true))))
      .toMatchObject({ kind: "json", root: { omitted: 151 } });
    const nested = normalizeToolDetailOutput("[".repeat(1000) + "0" + "]".repeat(1000));
    expect(nested.kind).toBe("json");
    if (nested.kind !== "json") throw new Error("expected JSON");
    let node = nested.root;
    for (let depth = 0; depth < 8; depth += 1) {
      if (!("children" in node)) throw new Error("expected a branch");
      node = node.children[0]!;
    }
    expect(node).toMatchObject({ children: [], omitted: 1 });
    const huge = JSON.stringify({ text: "x".repeat(250_000) });
    expect(normalizeToolDetailOutput(huge)).toEqual({ kind: "text", text: huge.slice(0, 24 * 1024), truncated: true });
  });
});
