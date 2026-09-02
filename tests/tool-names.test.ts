import { describe, expect, test } from "bun:test";
import {
  eventsIndicateFileEdits,
  isFileMutatingToolName,
} from "../src/lib/providers/tool-names";
import type { NormalizedProviderEvent } from "../src/lib/providers/provider.types";

describe("isFileMutatingToolName", () => {
  test("recognizes the write tools each provider exposes", () => {
    for (const name of [
      "Edit",
      "MultiEdit",
      "Write",
      "NotebookEdit",
      "apply_patch",
      "str_replace_based_edit_tool",
      "write_file",
    ]) {
      expect(isFileMutatingToolName(name)).toBe(true);
    }
  });

  test("treats shell tools as possible mutations", () => {
    // A command can `sed -i` or `git apply`; a false positive costs one extra
    // diff check, a false negative would skip the guard on a real edit.
    expect(isFileMutatingToolName("Bash")).toBe(true);
    expect(isFileMutatingToolName("local_shell")).toBe(true);
  });

  test("looks through an MCP prefix", () => {
    expect(isFileMutatingToolName("mcp__something__write_file")).toBe(true);
    expect(isFileMutatingToolName("mcp__stave-local-mcp__stave_get_task")).toBe(
      false,
    );
  });

  test("does not flag read-only tools", () => {
    for (const name of ["Read", "Grep", "Glob", "WebFetch", "TodoWrite"]) {
      expect(isFileMutatingToolName(name)).toBe(false);
    }
  });
});

describe("eventsIndicateFileEdits", () => {
  test("a diff event is enough on its own", () => {
    const events: NormalizedProviderEvent[] = [
      {
        type: "diff",
        filePath: "src/a.ts",
        oldContent: "",
        newContent: "x",
      },
    ];
    expect(eventsIndicateFileEdits(events)).toBe(true);
  });

  test("a read-only turn reports no edits", () => {
    const events: NormalizedProviderEvent[] = [
      { type: "text", text: "Here is what I found." },
      {
        type: "tool",
        toolName: "Read",
        input: "{}",
        state: "completed",
      },
    ];
    expect(eventsIndicateFileEdits(events)).toBe(false);
  });

  test("a write tool call reports edits even without a diff event", () => {
    const events: NormalizedProviderEvent[] = [
      {
        type: "tool",
        toolName: "Edit",
        input: "{}",
        state: "completed",
      },
    ];
    expect(eventsIndicateFileEdits(events)).toBe(true);
  });

  test("an empty batch reports no edits", () => {
    expect(eventsIndicateFileEdits([])).toBe(false);
  });
});
