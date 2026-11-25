import { afterEach, describe, expect, test } from "bun:test";
import { applyAppLocale } from "@/i18n";
import {
  clipPathTail,
  describeToolCall,
  describeToolSentence,
  phraseToolAction,
  relativeTo,
  stripToolNamespace,
} from "@/lib/agent-progress";

const CWD = "/tmp/project";

afterEach(() => {
  applyAppLocale("en");
});

describe("tool sentences", () => {
  test("each common Claude tool reads as a sentence in both tenses", () => {
    const cases: [string, Record<string, unknown>, string, string][] = [
      ["Read", { file_path: `${CWD}/src/app.ts` }, "Reading src/app.ts", "Read src/app.ts"],
      ["Edit", { file_path: `${CWD}/src/app.ts` }, "Editing src/app.ts", "Edited src/app.ts"],
      ["MultiEdit", { file_path: `${CWD}/a.ts` }, "Editing a.ts", "Edited a.ts"],
      ["Write", { file_path: `${CWD}/notes.md` }, "Writing notes.md", "Wrote notes.md"],
      ["Bash", { command: "bun test tests/a.test.ts" }, "Running bun test tests/a.test.ts", "Ran bun test tests/a.test.ts"],
      ["Grep", { pattern: "useStore" }, "Searching for useStore", "Searched for useStore"],
      ["Glob", { pattern: "**/*.tsx" }, "Finding **/*.tsx", "Found **/*.tsx"],
      ["WebFetch", { url: "https://example.com/a" }, "Fetching https://example.com/a", "Fetched https://example.com/a"],
      ["WebSearch", { query: "stylex tokens" }, "Searching the web for stylex tokens", "Searched the web for stylex tokens"],
      ["TodoWrite", { todos: [] }, "Updating the plan", "Updated the plan"],
      ["Agent", { description: "Find the auth code", subagent_type: "Explore" }, "Starting an agent: Find the auth code", "Started an agent: Find the auth code"],
      ["Skill", { skill: "pdf" }, "Using pdf", "Used pdf"],
    ];
    for (const [tool, input, doing, done] of cases) {
      const sentence = describeToolSentence(tool, JSON.stringify(input), { cwd: CWD });
      expect([tool, sentence.doing, sentence.done]).toEqual([tool, doing, done]);
    }
  });

  test("Codex calls read the same way as Claude calls", () => {
    expect(describeToolSentence("bash", JSON.stringify({ command: "git status" })).done).toBe("Ran git status");
    expect(describeToolSentence("fileChange", JSON.stringify({ paths: [`${CWD}/src/x.ts`] }), { cwd: CWD }).doing)
      .toBe("Editing src/x.ts");
    expect(describeToolSentence("web_search", "vite config").done).toBe("Searched the web for vite config");
    expect(describeToolSentence("exec_command", JSON.stringify({ cmd: ["ls", "-la"] })).done).toBe("Ran ls -la");
    expect(describeToolSentence("collaboration:spawn_agent", JSON.stringify({ message: "Review the diff" })).doing)
      .toBe("Starting an agent: Review the diff");
  });

  test("MCP tools lose their server prefix and never show JSON", () => {
    const claude = describeToolSentence("mcp__github__create_issue", JSON.stringify({ title: "Bug" }));
    expect(claude.doing).toBe("Using create issue");
    expect(claude.done).toBe("Used create issue");
    expect(claude.done).not.toContain("mcp__");
    expect(claude.done).not.toContain("{");
    const codex = describeToolSentence("linear:list_issues", JSON.stringify({ query: "open" }));
    expect(codex.done).toBe("list issues: open");
    expect(stripToolNamespace("mcp:server:tool_name")).toBe("tool_name");
  });

  test("Stave tools keep their product name", () => {
    const sentence = describeToolSentence("mcp__stave-local__stave_lens_screenshot", "{}");
    expect(sentence.doing).toBe("Capture screen");
    expect(sentence.done).toBe("Capture screen");
  });

  test("paths are relative to the workspace and long ones keep their end", () => {
    expect(relativeTo(`${CWD}/src/a.ts`, CWD)).toBe("src/a.ts");
    expect(relativeTo("/elsewhere/a.ts", CWD)).toBe("/elsewhere/a.ts");
    expect(relativeTo("C:\\repo\\src\\a.ts", "C:\\repo")).toBe("src/a.ts");
    const long = `${CWD}/${"nested/".repeat(20)}VeryLongComponentName.tsx`;
    const sentence = describeToolSentence("Read", JSON.stringify({ file_path: long }), { cwd: CWD });
    expect(sentence.done.startsWith("Read …/")).toBe(true);
    expect(sentence.done.endsWith("VeryLongComponentName.tsx")).toBe(true);
    expect(sentence.done.length).toBeLessThanOrEqual("Read ".length + 56);
    expect(clipPathTail("short/path.ts")).toBe("short/path.ts");
    expect(clipPathTail(`a/${"b".repeat(80)}.ts`, 20).endsWith(".ts")).toBe(true);
  });

  test("a call without an object still reads", () => {
    expect(describeToolSentence("Read", "{}").doing).toBe("Reading a file");
    expect(describeToolSentence("Bash", "{}").done).toBe("Ran a command");
    // A raw command (Codex sends one before its JSON arrives) is the command itself.
    expect(describeToolSentence("bash", "ls src").done).toBe("Ran ls src");
    expect(phraseToolAction({ verb: "tool", tool: "lookup" }, "done")).toBe("Used lookup");
  });

  test("words follow the display language", () => {
    applyAppLocale("ko");
    const sentence = describeToolSentence("Read", JSON.stringify({ file_path: `${CWD}/src/x.ts` }), { cwd: CWD });
    expect(sentence.doing).toBe("src/x.ts 읽는 중");
    expect(sentence.done).toBe("src/x.ts 읽음");
  });

  test("the verb model matches the one external sessions use", () => {
    expect(describeToolCall("Grep", JSON.stringify({ pattern: "x" }))).toEqual({ verb: "search", target: "x" });
    expect(describeToolCall("Bash", { command: "token=abcdefghijklmnop make" }).target).toContain("<redacted>");
  });
});
