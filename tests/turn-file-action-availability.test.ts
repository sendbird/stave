import { expect, test } from "bun:test";
import { canOfferClaudeFileRewind, resolveTurnFileAction } from "../src/components/session/turn-file-action-availability";
import type { ChatMessage } from "../src/types/chat";

const claudeUser: ChatMessage = {
  id: "user-1", role: "user", providerId: "user", model: "user", content: "Edit the file", parts: [], turnId: "turn-1",
  providerBoundary: { providerId: "claude-code", kind: "message", nativeId: "native-user-1" },
};

test("the restore action appears only for a turn with a retained snapshot", () => {
  const catalog = { snapshotTurnIds: new Set(["turn-1"]), skipped: new Map([["turn-2", "captureFailed" as const]]) };
  expect(resolveTurnFileAction({ turnId: "turn-1", catalog })).toEqual({ kind: "restore" });
  expect(resolveTurnFileAction({ turnId: "turn-2", catalog })).toEqual({ kind: "noSnapshot", reason: "captureFailed" });
  expect(resolveTurnFileAction({ turnId: "turn-3", catalog })).toEqual({ kind: "none" });
  expect(resolveTurnFileAction({ turnId: undefined, catalog })).toEqual({ kind: "none" });
});

test("Claude history without a snapshot keeps the native file rewind entry", () => {
  const base = { message: claudeUser, activeTurnId: undefined, rewindSupported: true, hasSnapshot: false };
  expect(canOfferClaudeFileRewind(base)).toBe(true);
  // A retained snapshot replaces the native entry so a turn offers one restore path.
  expect(canOfferClaudeFileRewind({ ...base, hasSnapshot: true })).toBe(false);
  expect(canOfferClaudeFileRewind({ ...base, rewindSupported: false })).toBe(false);
  expect(canOfferClaudeFileRewind({ ...base, activeTurnId: "running" })).toBe(false);
  expect(canOfferClaudeFileRewind({ ...base, message: { ...claudeUser, providerBoundary: { providerId: "codex", kind: "message", nativeId: "x" } } })).toBe(false);
  expect(canOfferClaudeFileRewind({ ...base, message: { ...claudeUser, role: "assistant" } })).toBe(false);
});
