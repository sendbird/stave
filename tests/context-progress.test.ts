import { expect, test } from "bun:test";
import { compactionElapsed } from "../src/components/ai-elements/compaction-progress";
import { contextTokenLabel } from "../src/components/ai-elements/context-token-label";
import { appendProviderEventToAssistant } from "../src/lib/session/provider-event-replay";
import { ChatMessageSchema } from "../src/lib/task-context/schemas";
import { i18n } from "../src/i18n/runtime";

test("compaction records its own observed start and survives message validation", () => {
  const message = appendProviderEventToAssistant({
    message: { id: "m", role: "assistant", content: "", parts: [], isStreaming: true },
    event: { type: "system", content: "Compacting conversation context…" },
  });
  const part = message.parts[0];
  expect(part?.type).toBe("system_event");
  if (part?.type !== "system_event") throw new Error("Expected a system event");
  expect(Number.isFinite(Date.parse(part.startedAt!))).toBe(true);
  expect(ChatMessageSchema.parse({ ...message, model: "preview", providerId: "user" }).parts[0]).toMatchObject({ startedAt: part.startedAt });
  const done = appendProviderEventToAssistant({ message, event: { type: "system", content: "Context compacted (auto).", compactBoundary: { trigger: "auto" } } });
  expect(done.parts).toHaveLength(1);
  expect(done.parts[0]).not.toHaveProperty("startedAt");
});

test("elapsed duration falls back for unknown starts and clamps future starts", () => {
  expect(compactionElapsed(undefined, 12000)).toBeNull();
  expect(compactionElapsed("invalid", 12000)).toBeNull();
  expect(compactionElapsed("1970-01-01T00:00:00Z", 12000)).toBe("12s");
  expect(compactionElapsed("1970-01-01T00:01:00Z", 12000)).toBe("0s");
});

test("token counts use the shared locale formatter and require both readings", async () => {
  for (const locale of ["en", "ko"]) {
    await i18n.changeLanguage(locale);
    expect(contextTokenLabel({ usedTokens: 720000, windowTokens: 1000000 })).toBe("720k / 1M");
    expect(contextTokenLabel({ usedTokens: 950, windowTokens: 12500 })).toBe("950 / 13k");
    expect(contextTokenLabel({ usedTokens: 0, windowTokens: 1000000 })).toBe("0 / 1M");
    expect(contextTokenLabel({ usedTokens: 10 })).toBeNull();
  }
  await i18n.changeLanguage("en");
});
