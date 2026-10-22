import { describe, expect, test } from "bun:test";
import {
  availableReviewScopes,
  classifyStageFiles,
  defaultReviewScope,
  reviewFileStatus,
  sameReviewScope,
  turnReviewFiles,
  type ReviewFile,
} from "../src/lib/review/review-scope";
import type { ChatMessage, MessagePart } from "../src/types/chat";

const file = (path: string, extra: Partial<ReviewFile> = {}): ReviewFile => ({ path, status: "modified", additions: 1, deletions: 0, ...extra });

function message(turnId: string, parts: MessagePart[]): ChatMessage {
  return { id: `${turnId}-${parts.length}`, role: "assistant", model: "m", providerId: "claude-code", content: "", parts, turnId } as ChatMessage;
}
const diff = (filePath: string, oldContent: string, newContent: string): MessagePart =>
  ({ type: "code_diff", filePath, oldContent, newContent, status: "accepted" }) as MessagePart;

describe("review scopes", () => {
  test("a file the stage recorded is the stage's; another file changed later is after the stage", () => {
    const { files, limits } = classifyStageFiles(
      [file("src/a.ts"), file("src/new.ts", { status: "added", untracked: true }), file("src/b.ts"), file("src/moved.ts", { status: "renamed", oldPath: "src/old.ts" })],
      { changedPaths: ["src/a.ts", "src/new.ts", "src/old.ts"] },
    );
    expect(files.map((entry) => [entry.path, entry.origin])).toEqual([
      ["src/a.ts", "stage"], ["src/new.ts", "stage"], ["src/b.ts", "after-stage"], ["src/moved.ts", "stage"],
    ]);
    // A later edit to one of the stage's own files cannot be separated, and Review says so.
    expect(limits).toEqual(["later-edits-merge"]);
  });

  test("a stage that recorded no paths cannot tell its files apart, and says so", () => {
    const { files, limits } = classifyStageFiles([file("src/a.ts")], {});
    expect(files[0]?.origin).toBe("unknown");
    expect(limits).toEqual(["no-recorded-paths", "later-edits-merge"]);
    expect(classifyStageFiles([file("src/a.ts")], null).limits).toContain("no-recorded-paths");
  });

  test("past a truncated path list nothing is attributed to after the stage", () => {
    const { files, limits } = classifyStageFiles([file("src/a.ts"), file("src/z.ts")], { changedPaths: ["src/a.ts"], changedPathsTruncated: true });
    expect(files.map((entry) => entry.origin)).toEqual(["stage", "unknown"]);
    expect(limits).toEqual(["later-edits-merge", "paths-truncated"]);
  });

  test("a turn shows only the edits its agent reported, from before its first edit to after its last", () => {
    const messages = [
      message("turn-1", [diff("src/a.ts", "a0", "a1")]),
      message("turn-2", [diff("src/a.ts", "a1", "a2"), { type: "tool_use", toolUseId: "t", toolName: "Bash", input: "sed -i s/x/y/ src/c.ts", state: "output-available" } as MessagePart]),
      message("turn-2", [diff("src/a.ts", "a2", "a3"), diff("src/new.ts", "", "n"), diff("src/gone.ts", "g", "")]),
    ];
    const { files, limits } = turnReviewFiles(messages, "turn-2");
    expect(files.map((entry) => [entry.path, entry.status, entry.oldContent, entry.newContent])).toEqual([
      ["src/a.ts", "modified", "a1", "a3"], ["src/gone.ts", "deleted", "g", ""], ["src/new.ts", "added", "", "n"],
    ]);
    // The shell edit to src/c.ts was never reported, so the turn scope cannot show it.
    expect(files.some((entry) => entry.path === "src/c.ts")).toBe(false);
    expect(limits).toEqual(["reported-edits-only"]);
  });

  test("git status letters become review statuses", () => {
    expect(["A", "M", "D", "R100", "C75", "T", "U"].map(reviewFileStatus)).toEqual(["added", "modified", "deleted", "renamed", "copied", "modified", "modified"]);
  });

  test("Review opens on the stage from a sign-off, otherwise the latest turn; stage only with a run", () => {
    const stage = { agentRunId: "run-1", stageId: "build", attempt: 2 };
    expect(defaultReviewScope({ stage, latestTurn: { taskId: "task-1", turnId: "turn-9" } })).toEqual({ kind: "stage", ...stage });
    expect(defaultReviewScope({ latestTurn: { taskId: "task-1", turnId: "turn-9" } })).toEqual({ kind: "turn", taskId: "task-1", turnId: "turn-9" });
    expect(defaultReviewScope({})).toEqual({ kind: "uncommitted" });
    expect(availableReviewScopes({ hasAgentRun: false, hasTurn: true })).toEqual(["turn", "branch", "uncommitted"]);
    expect(availableReviewScopes({ hasAgentRun: true, hasTurn: false })).toEqual(["stage", "branch", "uncommitted"]);
    expect(sameReviewScope({ kind: "stage", ...stage }, { kind: "stage", ...stage, attempt: 3 })).toBe(false);
    expect(sameReviewScope({ kind: "branch" }, { kind: "branch" })).toBe(true);
  });
});
