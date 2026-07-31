import { describe, expect, test } from "bun:test";
import {
  buildConversationTurnRailItems,
  findActiveConversationTurnMessageId,
  getConversationRailTickScale,
  toConversationTurnPreviewText,
} from "@/components/session/conversation-turn-rail.utils";
import type { ConversationTurnActionState } from "@/lib/providers/thread-actions";
import type { ChatMessage } from "@/types/chat";

const AVAILABLE_STATE: ConversationTurnActionState = {
  fork: { enabled: true, reason: "Fork this turn." },
  rollback: { enabled: true, reason: "Roll back to this turn." },
};

function message(args: {
  id: string;
  role: "user" | "assistant";
  content: string;
  providerId?: "claude-code" | "codex";
}): ChatMessage {
  return {
    id: args.id,
    role: args.role,
    content: args.content,
    parts: [{ type: "text", text: args.content }],
    model: args.role === "assistant" ? "gpt-5.6-terra" : "",
    providerId:
      args.role === "assistant" ? (args.providerId ?? "codex") : "user",
  };
}

describe("conversation turn rail items", () => {
  test("pairs each actionable assistant response with its latest user prompt", () => {
    const messages = [
      message({ id: "user-1", role: "user", content: "First prompt" }),
      message({
        id: "assistant-1",
        role: "assistant",
        content: "First answer",
      }),
      message({
        id: "assistant-hidden",
        role: "assistant",
        content: "Hidden answer",
      }),
      message({ id: "user-2", role: "user", content: "Second prompt" }),
      message({
        id: "assistant-2",
        role: "assistant",
        providerId: "claude-code",
        content: "Second answer",
      }),
    ];
    const items = buildConversationTurnRailItems({
      messages,
      actionStateByMessageId: new Map([
        ["assistant-1", AVAILABLE_STATE],
        ["assistant-2", AVAILABLE_STATE],
      ]),
    });

    expect(items.map((item) => item.messageId)).toEqual([
      "assistant-1",
      "assistant-2",
    ]);
    expect(items[0]).toMatchObject({
      messageIndex: 1,
      promptPreview: "First prompt",
      responsePreview: "First answer",
      providerId: "codex",
    });
    expect(items[1]).toMatchObject({
      messageIndex: 4,
      promptPreview: "Second prompt",
      responsePreview: "Second answer",
      providerId: "claude-code",
    });
  });

  test("normalizes long previews without splitting a surrogate pair", () => {
    const preview = toConversationTurnPreviewText(
      `${"word ".repeat(27)}😀 trailing text`,
    );

    expect(preview.length).toBeLessThanOrEqual(140);
    expect(preview.endsWith("…")).toBe(true);
    expect(preview).not.toContain("\ud83d…");
    expect(toConversationTurnPreviewText("  line one\n line two  ")).toBe(
      "line one line two",
    );
  });
});

describe("conversation turn rail presentation", () => {
  test("uses the Codex-inspired hover pyramid scales", () => {
    expect(
      [0, 1, 2, 3, 4].map((index) =>
        getConversationRailTickScale({
          index,
          displayedIndex: 2,
          active: false,
        }),
      ),
    ).toEqual([0.44, 0.68, 1, 0.68, 0.44]);
    expect(
      getConversationRailTickScale({
        index: 3,
        displayedIndex: -1,
        active: true,
      }),
    ).toBe(0.68);
  });

  test("selects the turn nearest the conversation reading line", () => {
    expect(
      findActiveConversationTurnMessageId({
        turns: [
          { messageId: "turn-1", top: 80, bottom: 180 },
          { messageId: "turn-2", top: 210, bottom: 390 },
          { messageId: "turn-3", top: 420, bottom: 560 },
        ],
        viewportTop: 100,
        viewportHeight: 600,
      }),
    ).toBe("turn-2");
    expect(
      findActiveConversationTurnMessageId({
        turns: [{ messageId: "offscreen", top: 900, bottom: 1_000 }],
        viewportTop: 100,
        viewportHeight: 600,
      }),
    ).toBeNull();
  });
});
