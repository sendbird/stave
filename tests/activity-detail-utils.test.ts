import { describe, expect, test } from "bun:test";
import {
  mergeActivityEntries,
  messagesToActivityEntries,
  providerEntriesToActivityEntries,
} from "@/components/session/activity-detail.utils";
import type { ChatMessage } from "@/types/chat";

function message(
  id: string,
  text: string,
  isStreaming = false,
): ChatMessage {
  return {
    id,
    role: "assistant",
    model: "model-1",
    providerId: "codex",
    content: text,
    isStreaming,
    parts: [{ type: "text", text }],
  };
}

describe("activity detail log", () => {
  test("keeps saved rows while live child updates replace matching events", () => {
    const saved = messagesToActivityEntries(
      [message("old", "Earlier work"), message("current", "Saved partial")],
      "saved",
    );
    const live = messagesToActivityEntries(
      [message("current", "Live complete", true), message("new", "Newest work", true)],
      "live",
    );

    expect(mergeActivityEntries(saved, live)).toEqual([
      expect.objectContaining({ id: "old:0", text: "Earlier work", source: "saved" }),
      expect.objectContaining({ id: "current:0", text: "Live complete", source: "live" }),
      expect.objectContaining({ id: "new:0", text: "Newest work", source: "live" }),
    ]);
  });

  test("does not hide live events when provider history already exists", () => {
    const provider = providerEntriesToActivityEntries([
      { id: "history-1", title: "agentMessage", text: "Inspecting files" },
    ]);
    const live = [
      { id: "progress-1", title: "Progress 1", text: "Running tests", source: "live" as const },
    ];

    expect(mergeActivityEntries(provider, live).map((entry) => entry.source)).toEqual([
      "provider",
      "live",
    ]);
  });
});
