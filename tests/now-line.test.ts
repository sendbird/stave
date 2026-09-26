import { describe, expect, test } from "bun:test";
import { describeToolActivity, nextNowLine, NOW_LINE_MIN_INTERVAL_MS } from "../src/lib/missions/now-line";
import { selectNowPhrase } from "../src/components/missions/MissionBar";
import type { ProviderTurnActivitySnapshot } from "../src/lib/providers/turn-status";

describe("the Now line", () => {
  test("names what a command does, never the tool", () => {
    const run = (detail: string) => describeToolActivity({ toolName: "Bash", detail });
    expect(run("bun test tests/billing.test.ts")).toBe("Running the tests");
    expect(run("bun run typecheck")).toBe("Type-checking");
    expect(run("bun run lint && bun test")).toBe("Linting");
    expect(run("git push origin feature/csv")).toBe("Pushing the branch");
    expect(run("git commit -m 'feat: csv'")).toBe("Committing the change");
    expect(run("gh run view 12 --log-failed")).toBe("Reading the check logs");
    expect(run("bun install")).toBe("Installing dependencies");
    expect(run("ls -la")).toBe("Running a command");
    expect(describeToolActivity({ toolName: "bash", detail: "npx vitest run" })).toBe("Running the tests");
  });

  test("maps reading, editing and Stave's own tools to plain phrases", () => {
    expect(describeToolActivity({ toolName: "Read" })).toBe("Reading the code");
    expect(describeToolActivity({ toolName: "Grep" })).toBe("Searching the code");
    expect(describeToolActivity({ toolName: "MultiEdit" })).toBe("Editing files");
    expect(describeToolActivity({ toolName: "fileChange" })).toBe("Editing files");
    expect(describeToolActivity({ toolName: "TodoWrite" })).toBe("Updating the plan");
    expect(describeToolActivity({ toolName: "mcp__stave-local-mcp__stave_report_stage" })).toBe(
      "Reporting the stage",
    );
    expect(describeToolActivity({ toolName: "mcp__claude_ai_Slack__slack_read_thread" })).toBe(
      "Using claude ai Slack",
    );
    expect(describeToolActivity({ toolName: "SomethingNew" })).toBe("Working");
  });

  test("holds each phrase for the minimum interval", () => {
    const first = nextNowLine(null, "Reading the code", 1_000);
    expect(nextNowLine(first, "Editing files", 1_000 + NOW_LINE_MIN_INTERVAL_MS - 1)).toBe(first);
    expect(nextNowLine(first, "Editing files", 1_000 + NOW_LINE_MIN_INTERVAL_MS)).toEqual({
      text: "Editing files",
      shownAt: 1_000 + NOW_LINE_MIN_INTERVAL_MS,
    });
    expect(nextNowLine(first, "Reading the code", 99_999)).toBe(first);
  });

  test("reads the running turn's latest tool call", () => {
    const activity = {
      turnId: "turn-1",
      providerId: "claude-code",
      startedAt: 0,
      lastEventAt: 0,
      stalledAt: null,
      pendingInteraction: null,
      orderedWorkItemIds: ["a", "b"],
      workItemsById: {
        a: { id: "a", kind: "tool", status: "completed", title: "Read file", toolName: "Read", progressMessages: [], startedAt: 1, updatedAt: 1 },
        b: { id: "b", kind: "tool", status: "running", title: "Run command", toolName: "Bash", detail: "bun test", progressMessages: [], startedAt: 2, updatedAt: 2 },
      },
    } as unknown as ProviderTurnActivitySnapshot;
    expect(selectNowPhrase(activity)).toBe("Running the tests");
    expect(selectNowPhrase({ ...activity, orderedWorkItemIds: [] })).toBe("Thinking");
    expect(selectNowPhrase({ ...activity, completedAt: 3 })).toBeNull();
    expect(selectNowPhrase(undefined)).toBeNull();
  });
});
