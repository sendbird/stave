import { afterEach, describe, expect, test } from "bun:test";
import { applyAppLocale } from "@/i18n";
import {
  buildModelChangeMarkers,
  buildUserMessageGroups,
  formatUserMessageGroupNotes,
} from "@/components/session/chat-panel-row-groups";
import { buildConversationDateSeparators } from "@/components/session/conversation-time";
import { visibleSteerMessageSegments } from "@/lib/session/steer-message-segments";
import { buildSteeredUserMessageState } from "@/store/chat-state-helpers";
import type { ChatMessage } from "@/types/chat";

afterEach(() => {
  applyAppLocale("en");
});

let sequence = 0;
function user(overrides: Partial<ChatMessage> = {}): ChatMessage {
  sequence += 1;
  return {
    id: `user-${sequence}`,
    role: "user",
    providerId: "user",
    model: "user",
    content: "Next step",
    parts: [],
    ...overrides,
  };
}
function reply(overrides: Partial<ChatMessage>): ChatMessage {
  sequence += 1;
  return {
    id: `reply-${sequence}`,
    role: "assistant",
    providerId: "claude-code",
    model: "claude-sonnet-4-6",
    content: "Done.",
    parts: [],
    ...overrides,
  };
}
function markers(messages: ChatMessage[]) {
  return [...buildModelChangeMarkers(messages).entries()].map(
    ([id, marker]) => ({ id, ...marker }),
  );
}

describe("model change markers", () => {
  test("mark the later reply when the model and effort change, never the first reply", () => {
    const first = reply({ modelInfo: { effort: "medium" } });
    const second = reply({ model: "claude-opus-4-8", modelInfo: { effort: "high" } });
    expect(markers([user(), first, user(), second])).toEqual([
      { id: second.id, from: "Claude Sonnet 4.6 · Medium", to: "Claude Opus 4.8 · High" },
    ]);
  });

  test("mark an effort change alone (Codex)", () => {
    const second = reply({ providerId: "codex", model: "gpt-5.5", modelInfo: { effort: "high" } });
    expect(
      markers([
        reply({ providerId: "codex", model: "gpt-5.5", modelInfo: { effort: "medium" } }),
        user(),
        second,
      ]),
    ).toEqual([{ id: second.id, from: "GPT-5.5 · Medium", to: "GPT-5.5 · High" }]);
  });

  test("ignore fast mode, an unchanged model, and an effort one reply did not record", () => {
    expect(
      markers([
        reply({ modelInfo: { effort: "high", fastMode: false } }),
        user(),
        reply({ modelInfo: { effort: "high", fastMode: true } }),
        user(),
        reply({}),
        user(),
        reply({ modelInfo: { effort: "high" } }),
      ]),
    ).toEqual([]);
  });

  test("omit effort for a model that has none", () => {
    const second = reply({ model: "claude-haiku-4-5" });
    expect(markers([reply({ modelInfo: { effort: "high" } }), user(), second])).toEqual([
      { id: second.id, from: "Claude Sonnet 4.6 · High", to: "Claude Haiku 4.5" },
    ]);
  });

  test("mark a provider change between any providers", () => {
    const codex = reply({ providerId: "codex", model: "gpt-5.5", modelInfo: { effort: "high" } });
    const kiro = reply({ providerId: "kiro", model: "kiro-model", modelInfo: { effort: "xhigh" } });
    const opencode = reply({
      providerId: "opencode",
      model: "anthropic/claude-sonnet-4-6",
      modelInfo: { effort: "high" },
    });
    const cursor = reply({ providerId: "cursor", model: "gpt-5.6-sol[reasoning=high]" });
    const claude = reply({ modelInfo: { effort: "medium" } });
    const result = markers([claude, user(), codex, user(), kiro, user(), opencode, user(), cursor]);
    expect(result.map((marker) => marker.id)).toEqual([codex.id, kiro.id, opencode.id, cursor.id]);
    expect(result[0]).toMatchObject({ from: "Claude Sonnet 4.6 · Medium", to: "GPT-5.5 · High" });
    expect(result[1]).toMatchObject({ from: "GPT-5.5 · High", to: "Kiro Model · X-High" });
    expect(result[3]?.to).toBe("GPT-5.6 Sol · High");
  });

  test("read a Cursor effort from its model id", () => {
    const second = reply({ providerId: "cursor", model: "gpt-5.6-sol[reasoning=low]" });
    expect(
      markers([reply({ providerId: "cursor", model: "gpt-5.6-sol[reasoning=high]" }), user(), second]),
    ).toEqual([{ id: second.id, from: "GPT-5.6 Sol · High", to: "GPT-5.6 Sol · Low" }]);
  });

  test("name the providers when the same model ran on another one", () => {
    const second = reply({ providerId: "opencode", modelInfo: { effort: "high" } });
    const [marker] = markers([reply({ modelInfo: { effort: "high" } }), user(), second]);
    expect(marker?.from).toMatch(/· Claude Sonnet 4\.6 · High$/);
    expect(marker?.to).toMatch(/· Claude Sonnet 4\.6 · High$/);
    expect(marker?.from).not.toBe(marker?.to);
  });

  test("skip Stave notices without resetting the comparison", () => {
    const notice = reply({ providerId: "user", model: "system" });
    const after = reply({ model: "claude-opus-4-8", modelInfo: { effort: "high" } });
    expect(
      markers([reply({ modelInfo: { effort: "high" } }), notice, user(), after]),
    ).toEqual([{ id: after.id, from: "Claude Sonnet 4.6 · High", to: "Claude Opus 4.8 · High" }]);
  });
});

describe("model change markers with Auto routing", () => {
  // Auto picked Sonnet; the runtime ran the model on the reply itself.
  const autoPickedSonnet = {
    source: "classifier",
    selectedProviderId: "claude-code",
    selectedModel: "claude-sonnet-4-6",
  } as ChatMessage["modelResolution"];

  test("auto -> manual compares against the model Auto ran", () => {
    const routed = reply({
      model: "claude-opus-4-8",
      modelInfo: { effort: "high" },
      modelResolution: autoPickedSonnet,
    });
    const manual = reply({ modelInfo: { effort: "high" } });
    expect(markers([routed, user(), manual])).toEqual([
      { id: manual.id, from: "Claude Opus 4.8 · High", to: "Claude Sonnet 4.6 · High" },
    ]);
  });

  test("manual -> auto on the same effective model shows no line", () => {
    const routed = reply({
      modelInfo: { effort: "high" },
      modelResolution: autoPickedSonnet,
    });
    expect(markers([reply({ modelInfo: { effort: "high" } }), user(), routed])).toEqual([]);
  });

  test("manual -> auto on another effective model shows the line", () => {
    const routed = reply({
      providerId: "codex",
      model: "gpt-5.5",
      modelInfo: { effort: "medium" },
      modelResolution: autoPickedSonnet,
    });
    expect(markers([reply({ modelInfo: { effort: "high" } }), user(), routed])).toEqual([
      { id: routed.id, from: "Claude Sonnet 4.6 · High", to: "GPT-5.5 · Medium" },
    ]);
  });

  test("auto -> auto compares both effective models", () => {
    const first = reply({
      model: "claude-opus-4-8",
      modelInfo: { effort: "high" },
      modelResolution: autoPickedSonnet,
    });
    const same = reply({
      model: "claude-opus-4-8",
      modelInfo: { effort: "high" },
      modelResolution: autoPickedSonnet,
    });
    const other = reply({ modelInfo: { effort: "high" }, modelResolution: autoPickedSonnet });
    expect(markers([first, user(), same, user(), other])).toEqual([
      { id: other.id, from: "Claude Opus 4.8 · High", to: "Claude Sonnet 4.6 · High" },
    ]);
  });
});

describe("model change markers in every language", () => {
  for (const locale of ["en", "ko"] as const) {
    test(`fast mode alone shows no line (${locale})`, () => {
      applyAppLocale(locale);
      const codex = { providerId: "codex", model: "gpt-5.5" } as const;
      expect(
        markers([
          reply({ ...codex, modelInfo: { effort: "high", fastMode: false } }),
          user(),
          reply({ ...codex, modelInfo: { effort: "high", fastMode: true } }),
          user(),
          reply({ ...codex, modelInfo: { effort: "high", fastMode: false } }),
        ]),
      ).toEqual([]);
      expect(
        markers([
          reply({ modelInfo: { effort: "high", fastMode: false } }),
          user(),
          reply({ modelInfo: { effort: "high", fastMode: true } }),
        ]),
      ).toEqual([]);
      expect(
        markers([
          reply({ providerId: "cursor", model: "gpt-5.6-sol[reasoning=high,fast=false]" }),
          user(),
          reply({ providerId: "cursor", model: "gpt-5.6-sol[fast=true,reasoning=high]" }),
          user(),
          reply({
            providerId: "cursor",
            model: "gpt-5.6-sol",
            modelInfo: { effort: "high", fastMode: true },
          }),
        ]),
      ).toEqual([]);
    });

    test(`a model change leaves fast mode out of the line (${locale})`, () => {
      applyAppLocale(locale);
      const second = reply({
        providerId: "codex",
        model: "gpt-5.5",
        modelInfo: { effort: "medium", fastMode: true },
      });
      const [marker] = markers([
        reply({ providerId: "codex", model: "gpt-5.5", modelInfo: { effort: "high", fastMode: true } }),
        user(),
        second,
      ]);
      expect(marker?.id).toBe(second.id);
      expect(marker?.from).toMatch(/^GPT-5\.5 · [^·]+$/);
      expect(marker?.to).toMatch(/^GPT-5\.5 · [^·]+$/);
    });
  }

  test("reply segments split by a steer stay on one model", () => {
    const before = reply({ turnId: "turn-1", isStreaming: true, modelInfo: { effort: "high" } });
    const split = buildSteeredUserMessageState({
      messagesByTask: { task: [before] },
      messageCountByTask: { task: 1 },
      taskId: "task",
      content: "Also check the tests",
      steeredIntoTurnId: "turn-1",
      clientMessageId: "steer-1",
      provider: "claude-code",
      activeModel: "claude-sonnet-4-6",
      turnStillActive: true,
    }).messagesByTask.task!;
    expect(markers(split)).toEqual([]);
  });

  test("translate effort labels", () => {
    applyAppLocale("ko");
    const second = reply({ model: "claude-opus-4-8", modelInfo: { effort: "high" } });
    const [marker] = markers([reply({ modelInfo: { effort: "medium" } }), user(), second]);
    expect(marker?.to).not.toBe("Claude Opus 4.8 · High");
    expect(marker?.to).toStartWith("Claude Opus 4.8 · ");
  });
});

function steerInto(messages: ChatMessage[], id: string) {
  return buildSteeredUserMessageState({
    messagesByTask: { task: messages },
    messageCountByTask: { task: messages.length },
    taskId: "task",
    content: "Also check the tests",
    steeredIntoTurnId: "turn-1",
    clientMessageId: id,
    provider: "codex",
    activeModel: "gpt-5.5",
    turnStillActive: true,
  }).messagesByTask.task!;
}

describe("user message groups", () => {
  test("three steers sent before the reply wrote anything form one group", () => {
    const before = reply({
      id: "assistant-before",
      providerId: "codex",
      model: "gpt-5.5",
      turnId: "turn-1",
      isStreaming: true,
    });
    const visible = visibleSteerMessageSegments(
      steerInto(steerInto(steerInto([before], "steer-1"), "steer-2"), "steer-3"),
    );
    expect(visible.map((message) => message.id)).toEqual([
      "assistant-before",
      "steer-1",
      "steer-2",
      "steer-3",
      "steer-3-assistant",
    ]);
    const groups = buildUserMessageGroups(visible);
    expect(Object.fromEntries(groups)).toEqual({
      "steer-1": { position: "first" },
      "steer-2": { position: "middle" },
      "steer-3": { position: "last", notes: [{ kind: "steerAccepted", count: 3 }] },
    });
    expect(formatUserMessageGroupNotes(groups.get("steer-3")?.notes)).toBe(
      "Steered into active turn · 3",
    );
  });

  test("a single message, or messages split by a reply, form no group", () => {
    expect(buildUserMessageGroups([user(), reply({}), user(), reply({})]).size).toBe(0);
  });

  test("list each note kind once, in send order", () => {
    const prompt = user();
    const accepted = user({ steerDeliveryState: "accepted" });
    const rejected = user({ steerDeliveryState: "rejected" });
    const pending = user({ steerDeliveryState: "pending" });
    const groups = buildUserMessageGroups([prompt, accepted, rejected, pending]);
    expect(groups.get(pending.id)?.notes).toEqual([
      { kind: "steerAccepted", count: 1 },
      { kind: "steerRejected", count: 1 },
      { kind: "steerPending", count: 1 },
    ]);
    expect(formatUserMessageGroupNotes(groups.get(pending.id)?.notes)).toBe(
      "Steered into active turn, Steer rejected, Steer pending",
    );
    const plain = [user(), user()];
    const plainGroups = buildUserMessageGroups(plain);
    expect(plainGroups.get(plain[1]!.id)).toEqual({ position: "last", notes: [] });
    expect(formatUserMessageGroupNotes(plainGroups.get(plain[1]!.id)?.notes)).toBeUndefined();
  });

  test("a date separator, an agent run prompt or a question answer starts a new group", () => {
    const monday = user({ startedAt: "2026-01-05T10:00:00.000Z" });
    const mondayLater = user({ startedAt: "2026-01-05T10:01:00.000Z" });
    const tuesday = user({ startedAt: "2026-01-06T10:00:00.000Z" });
    const tuesdayLater = user({ startedAt: "2026-01-06T10:01:00.000Z" });
    const runPrompt = user({
      agentRunPrompt: { assignment: "Ship it" } as ChatMessage["agentRunPrompt"],
    });
    const answer = user({ questionReply: {} as ChatMessage["questionReply"] });
    const messages = [monday, mondayLater, tuesday, tuesdayLater, runPrompt, answer];
    const groups = buildUserMessageGroups(messages, buildConversationDateSeparators(messages));
    expect(Object.fromEntries([...groups].map(([id, row]) => [id, row.position]))).toEqual({
      [monday.id]: "first",
      [mondayLater.id]: "last",
      [tuesday.id]: "first",
      [tuesdayLater.id]: "last",
    });
  });

  test("the group note translates", () => {
    applyAppLocale("ko");
    expect(formatUserMessageGroupNotes([{ kind: "steerAccepted", count: 2 }])).toBe(
      "활성 턴에 방향 조정 전달됨 · 2",
    );
  });
});
