import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ShelfProviderSwitch,
  describeProviderSwitch,
} from "@/components/session/composer-shelf/ShelfProviderSwitch";
import { selectComposerShelfRows } from "@/components/session/composer-shelf/composer-shelf.utils";
import { buildBoundedHistory, planBoundedHistory } from "@/lib/providers/bounded-history";
import { buildCanonicalConversationRequest } from "@/lib/providers/canonical-request";
import { buildProviderTurnPrompt } from "@/lib/providers/provider-request-translators";
import { buildProviderSwitchPreview, resolveLatestReplyProvider } from "@/lib/providers/provider-switch-preview";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { ChatMessage } from "@/types/chat";

function message(id: string, role: "user" | "assistant", providerId: ProviderId | "user", content: string): ChatMessage {
  return { id, role, model: role === "user" ? "user" : "model", providerId, content, parts: [] };
}

/** A conversation of `pairs` exchanges with Claude, then one with Codex. */
function conversation(pairs: number, size = 40): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (let index = 0; index < pairs; index += 1) {
    messages.push(message(`u${index}`, "user", "user", `Request ${index} ${"x".repeat(size)}`));
    messages.push(message(`a${index}`, "assistant", "claude-code", `Answer ${index} ${"y".repeat(size)}`));
  }
  messages.push(message("u-codex", "user", "user", "Switch to Codex for this part."));
  messages.push(message("a-codex", "assistant", "codex", "Codex did it."));
  return messages;
}

/** The replay section of the prompt the real translator builds for the next message. */
function replaySection(messages: ChatMessage[], providerId: ProviderId, resume?: { nativeSessionId: string; syncedThroughMessageId?: string }) {
  const prompt = buildProviderTurnPrompt({
    providerId,
    prompt: "next",
    conversation: buildCanonicalConversationRequest({
      turnId: "t", taskId: "task", workspaceId: "ws", providerId, history: messages, userInput: "next",
      nativeSessionId: resume?.nativeSessionId ?? null, syncedThroughMessageId: resume?.syncedThroughMessageId ?? null,
    }),
  });
  // Sections are "[Header]", a blank line, then the body; a blank line separates sections.
  const header = "[Task Shared Context]\n\n";
  const start = prompt.indexOf(header);
  if (start < 0) return null;
  const rest = prompt.slice(start + header.length);
  const next = rest.indexOf("\n\n[Current User Input]");
  return next >= 0 ? rest.slice(0, next) : rest;
}

describe("bounded history plan", () => {
  test("says what it kept, left out and shortened, with the same text the prompt uses", () => {
    const small = [{ role: "user", text: "a" }, { role: "assistant", text: "b" }];
    expect(planBoundedHistory({ messages: small })).toMatchObject({ keptMessages: 2, omittedMessages: 0, overflowed: false });
    const big = Array.from({ length: 60 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", text: `${index} ${"z".repeat(600)}` }));
    const plan = planBoundedHistory({ messages: big });
    expect(plan.text).toBe(buildBoundedHistory({ messages: big }));
    expect(plan.overflowed).toBe(true);
    expect(plan.keptMessages + plan.omittedMessages).toBe(60);
    expect(plan.omittedMessages).toBeGreaterThan(0);
    expect(plan.text.length).toBeLessThanOrEqual(12_000);
  });
});

describe("provider switch preview", () => {
  test("is shown only when the next message goes to another provider than the last reply", () => {
    const messages = conversation(2);
    expect(resolveLatestReplyProvider(messages)).toBe("codex");
    expect(buildProviderSwitchPreview({ messages, toProviderId: "codex", resume: null })).toBeNull();
    expect(buildProviderSwitchPreview({ messages: [message("u", "user", "user", "hi")], toProviderId: "codex", resume: null })).toBeNull();
    expect(buildProviderSwitchPreview({ messages, toProviderId: "claude-code", resume: null })).not.toBeNull();
  });

  test("a provider new to the task gets the whole conversation, bounded, exactly as the prompt does", () => {
    const messages = conversation(40, 300);
    const preview = buildProviderSwitchPreview({ messages, toProviderId: "cursor", resume: null })!;
    expect(preview).toMatchObject({ fromProviderId: "codex", toProviderId: "cursor", session: "fresh", totalMessages: messages.length, overflowed: true });
    expect(preview.omittedMessages).toBeGreaterThan(0);
    expect(replaySection(messages, "cursor")?.length).toBe(preview.chars);
  });

  test("a provider coming back resumes its session and gets only what happened since its last sync", () => {
    const messages = conversation(3);
    const preview = buildProviderSwitchPreview({
      messages,
      toProviderId: "claude-code",
      resume: { nativeSessionId: "claude-session", syncedThroughMessageId: "a2" },
    })!;
    expect(preview).toMatchObject({ session: "resume", totalMessages: 2, keptMessages: 2, omittedMessages: 0, overflowed: false });
    expect(replaySection(messages, "claude-code", { nativeSessionId: "claude-session", syncedThroughMessageId: "a2" })?.length).toBe(preview.chars);
  });

  test("a provider command after a switch goes as typed, with no excerpt, exactly as the prompt does", () => {
    const messages = conversation(3);
    const input = "/compact keep the API notes";
    const preview = buildProviderSwitchPreview({ messages, toProviderId: "claude-code", resume: null, userInput: input })!;
    expect(preview).toMatchObject({ command: "/compact", totalMessages: 0, keptMessages: 0, chars: 0 });
    // The real prompt for the same input is the command alone.
    expect(buildProviderTurnPrompt({
      providerId: "claude-code",
      prompt: input,
      conversation: buildCanonicalConversationRequest({
        turnId: "t", taskId: "task", workspaceId: "ws", providerId: "claude-code", history: messages, userInput: input,
      }),
    })).toBe(input);
    const lines = describeProviderSwitch(preview, 2).join(" ");
    expect(lines).toContain("A provider command goes as typed: it receives no part of this task's conversation and no handoff record.");
    expect(lines).not.toContain("excerpt");
    expect(lines).not.toContain("handoff record first");
    const html = renderToStaticMarkup(createElement(ShelfProviderSwitch, { preview, workspaceId: "ws", taskId: "task" }));
    expect(html).toContain("/compact goes as typed, without this task&#x27;s conversation");
    expect(html).not.toContain("excerpt");
    // Ordinary text still carries the excerpt.
    const text = buildProviderSwitchPreview({ messages, toProviderId: "claude-code", resume: null, userInput: "Please continue" })!;
    expect(text.command).toBeUndefined();
    expect(text.chars).toBeGreaterThan(0);
  });

  test("reads as sentences that say what is kept and what is not", () => {
    const fresh = describeProviderSwitch({
      fromProviderId: "claude-code", toProviderId: "codex", session: "fresh",
      totalMessages: 40, keptMessages: 31, shortenedMessages: 2, omittedMessages: 9, chars: 11_850, maxChars: 12_000, overflowed: true,
    });
    expect(fresh).toEqual([
      "It starts its own session: it has not worked on this task before.",
      "It receives a 11,850-character excerpt of the conversation: 31 of 40 messages.",
      "To fit 12,000 characters, the first request and the latest messages are kept and 9 messages in between are left out.",
      "2 long messages are shortened in the middle.",
      "Messages travel as text: tool output, images and attached files stay behind.",
    ]);
    const resumed = describeProviderSwitch({
      fromProviderId: "codex", toProviderId: "claude-code", session: "resume",
      totalMessages: 2, keptMessages: 2, shortenedMessages: 0, omittedMessages: 0, chars: 180, maxChars: 12_000, overflowed: false,
    });
    expect(resumed).toContain("It receives the 2 messages since it last worked here, 180 characters.");
    expect(resumed).toContain("Nothing is left out.");
    // The handoff record goes with the excerpt, ahead of it, whenever the excerpt is sent.
    const withRecord = describeProviderSwitch({
      fromProviderId: "codex", toProviderId: "claude-code", session: "fresh",
      totalMessages: 2, keptMessages: 2, shortenedMessages: 0, omittedMessages: 0, chars: 180, maxChars: 12_000, overflowed: false,
    }, 2);
    expect(withRecord[1]).toBe("It receives the task's handoff record first: 2 sections.");
    expect(describeProviderSwitch({
      fromProviderId: "codex", toProviderId: "claude-code", session: "fresh",
      totalMessages: 2, keptMessages: 2, shortenedMessages: 0, omittedMessages: 0, chars: 180, maxChars: 12_000, overflowed: false,
    }, 0)[1]).toBe("This task has no handoff record yet.");
    expect(describeProviderSwitch({
      fromProviderId: "codex", toProviderId: "claude-code", session: "resume",
      totalMessages: 0, keptMessages: 0, shortenedMessages: 0, omittedMessages: 0, chars: 0, maxChars: 12_000, overflowed: false,
    }, 2).join(" ")).not.toContain("handoff record");
  });

  test("the shelf says it before a send, not while a turn runs", () => {
    expect(selectComposerShelfRows({ run: null, queueCount: 0, providerSwitch: true })).toEqual(["switch"]);
    expect(selectComposerShelfRows({ run: "turn", queueCount: 1, providerSwitch: true })).toEqual(["run", "queue"]);
    expect(selectComposerShelfRows({ run: null, queueCount: 0, accountBlocked: true, providerSwitch: true })).toEqual(["account", "switch"]);
    const html = renderToStaticMarkup(createElement(ShelfProviderSwitch, {
      preview: {
        fromProviderId: "claude-code", toProviderId: "codex", session: "fresh",
        totalMessages: 4, keptMessages: 4, shortenedMessages: 0, omittedMessages: 0, chars: 420, maxChars: 12_000, overflowed: false,
      },
    }));
    expect(html).toContain("Switching to Codex");
    expect(html).toContain("a new session with a 420-character excerpt of this task");
    expect(html).toContain("What it receives");
  });
});
