import { describe, expect, test } from "bun:test";
import {
  addTrustedToolEntry,
  buildTrustedToolEntryForApproval,
  formatTrustedToolEntry,
  isTrustedApproval,
  normalizeTrustedToolEntries,
  removeTrustedToolEntry,
  toClaudeAllowedToolsFromTrustedEntries,
} from "@/lib/providers/trusted-tools";

describe("trusted approval tools", () => {
  test("dedupes entries case-insensitively while preserving display casing", () => {
    expect(normalizeTrustedToolEntries(["Edit", " edit ", "", "Read"])).toEqual([
      "Edit",
      "Read",
    ]);
  });

  test("trusts ordinary tools by name", () => {
    expect(
      isTrustedApproval({
        trustedTools: ["Edit"],
        toolName: "edit",
      }),
    ).toBe(true);
    expect(
      isTrustedApproval({
        trustedTools: ["Edit"],
        toolName: "Bash",
        input: "bun test",
      }),
    ).toBe(false);
  });

  test("trusts Bash only by command prefix", () => {
    expect(
      buildTrustedToolEntryForApproval({
        toolName: "Bash",
        input: "bun test tests/trusted-tools.test.ts",
      }),
    ).toBe("bash:bun test tests/trusted-tools.test.ts");
    expect(
      isTrustedApproval({
        trustedTools: ["bash:bun test"],
        toolName: "bash",
        input: "bun test tests/trusted-tools.test.ts",
      }),
    ).toBe(true);
    expect(
      isTrustedApproval({
        trustedTools: ["bash:bun test"],
        toolName: "bash",
        input: "rm -rf dist",
      }),
    ).toBe(false);
  });

  test("maps only non-Bash trusted entries to Claude allowedTools", () => {
    expect(
      toClaudeAllowedToolsFromTrustedEntries(["Edit", "bash:bun test"]),
    ).toEqual(["Edit"]);
  });

  test("adds, removes, and formats entries", () => {
    const entries = addTrustedToolEntry({
      entries: ["Edit"],
      entry: "bash:bun test",
    });
    expect(entries).toEqual(["Edit", "bash:bun test"]);
    expect(formatTrustedToolEntry("bash:bun test")).toBe("Bash: bun test");
    expect(removeTrustedToolEntry({ entries, entry: "edit" })).toEqual([
      "bash:bun test",
    ]);
  });
});
