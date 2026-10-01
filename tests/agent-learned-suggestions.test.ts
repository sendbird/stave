import { describe, expect, test } from "bun:test";
import {
  MAX_AGENT_SUGGESTIONS,
  MAX_LEARNING_TRANSCRIPT_CHARS,
  addAgentSuggestion,
  buildLearningPrompt,
  buildLearningTranscript,
  dropAgentSuggestions,
  hasSuggestionForTask,
  hasUserFollowupCandidate,
  normalizeAgentSuggestions,
  normalizeLearningDisabled,
  parseLearningAnswer,
  removeAgentSuggestion,
  type AgentSuggestion,
} from "../src/lib/agents/learned-suggestions";
import { blankCustomAgent } from "../src/lib/agents/library";

function suggestion(overrides: Partial<AgentSuggestion> = {}): AgentSuggestion {
  return {
    id: "docs:task-1",
    agentConfigId: "docs",
    taskId: "task-1",
    createdAt: "2026-09-29T10:00:00.000Z",
    summary: "Run the link checker before reporting.",
    instructions: "You write docs.\nRun the link checker before reporting.",
    basedOn: "You write docs.",
    ...overrides,
  };
}

describe("hasUserFollowupCandidate", () => {
  test("needs a user message after the agent answered", () => {
    expect(hasUserFollowupCandidate([{ role: "user", content: "Write the docs" }])).toBe(false);
    expect(
      hasUserFollowupCandidate([
        { role: "user", content: "Write the docs" },
        { role: "assistant", content: "Done." },
      ]),
    ).toBe(false);
    expect(
      hasUserFollowupCandidate([
        { role: "user", content: "Write the docs" },
        { role: "assistant", content: "Done." },
        { role: "user", content: "You forgot the links." },
      ]),
    ).toBe(true);
  });

  test("ignores empty assistant rows", () => {
    expect(
      hasUserFollowupCandidate([
        { role: "user", content: "Write the docs" },
        { role: "assistant", content: "  " },
        { role: "user", content: "More detail" },
      ]),
    ).toBe(false);
  });
  test("new requests and acknowledgements are only classification candidates", () => {
    for (const content of ["Also add a dark theme.", "Why did you choose that?", "Thanks!"]) {
      expect(hasUserFollowupCandidate([
        { role: "assistant", content: "Done." }, { role: "user", content },
      ])).toBe(true);
    }
  });
});

describe("buildLearningTranscript", () => {
  test("keeps only user and agent prose, labelled", () => {
    const text = buildLearningTranscript([
      { role: "user", content: "Write the docs" },
      { role: "tool", content: "SECRET_TOOL_OUTPUT" },
      { role: "assistant", content: "Done." },
    ]);
    expect(text).toBe("USER: Write the docs\n\nAGENT: Done.");
  });

  test("keeps the newest messages within the budget", () => {
    const messages = Array.from({ length: 20 }, (_, index) => ({
      role: index % 2 ? "assistant" : "user",
      content: `${index}:${"x".repeat(1_400)}`,
    }));
    const text = buildLearningTranscript(messages);
    expect(text.length).toBeLessThanOrEqual(MAX_LEARNING_TRANSCRIPT_CHARS + 40);
    expect(text).toContain("19:");
    expect(text).not.toContain("USER: 0:");
  });
});

test("the prompt carries the current instructions and the conversation", () => {
  const agent = { ...blankCustomAgent({ name: "Docs", takenIds: [] }), instructions: "You write docs." };
  const prompt = buildLearningPrompt({ agent, transcript: "USER: hi" });
  expect(prompt).toContain("You write docs.");
  expect(prompt).toContain("USER: hi");
  expect(prompt).toContain("First classify the follow-up");
  expect(prompt).toContain("one-off task details mean change: false");
  expect(prompt).not.toContain("conversation in which the user corrected the agent");
});

describe("parseLearningAnswer", () => {
  test("no change", () => {
    expect(parseLearningAnswer('{"change": false}', "a")).toEqual({ ok: true, suggestion: null });
  });

  test("a change inside prose", () => {
    const result = parseLearningAnswer(
      'Sure:\n{"change": true, "summary": "Check links.", "instructions": "You write docs.\\nCheck links."}',
      "You write docs.",
    );
    expect(result).toEqual({
      ok: true,
      suggestion: { summary: "Check links.", instructions: "You write docs.\nCheck links." },
    });
  });

  test("identical instructions are no change", () => {
    expect(parseLearningAnswer('{"change": true, "summary": "x", "instructions": "same"}', "same")).toEqual({
      ok: true,
      suggestion: null,
    });
  });

  test("unreadable or incomplete answers fail", () => {
    expect(parseLearningAnswer("nope", "a").ok).toBe(false);
    expect(parseLearningAnswer('{"change": true, "summary": "x"}', "a").ok).toBe(false);
  });
});

describe("the suggestions map", () => {
  test("replaces a suggestion from the same task and caps per agent", () => {
    let map = addAgentSuggestion({}, suggestion());
    map = addAgentSuggestion(map, suggestion({ summary: "Newer." }));
    expect(map.docs).toHaveLength(1);
    expect(map.docs![0]!.summary).toBe("Newer.");
    for (let index = 2; index < 10; index += 1) {
      map = addAgentSuggestion(map, suggestion({ id: `docs:task-${index}`, taskId: `task-${index}` }));
    }
    expect(map.docs).toHaveLength(MAX_AGENT_SUGGESTIONS);
    expect(map.docs![0]!.taskId).toBe("task-9");
    expect(hasSuggestionForTask(map, "docs", "task-9")).toBe(true);
    expect(hasSuggestionForTask(map, "docs", "task-1")).toBe(false);
  });

  test("remove and drop clean up the agent key", () => {
    const map = addAgentSuggestion({}, suggestion());
    expect(removeAgentSuggestion(map, "docs", "docs:task-1")).toEqual({});
    expect(dropAgentSuggestions(map, "docs")).toEqual({});
    expect(dropAgentSuggestions(map, "other")).toBe(map);
  });

  test("normalize keeps well-formed entries only", () => {
    const restored = normalizeAgentSuggestions({
      docs: [suggestion(), { id: "broken" }, "nope"],
      other: "not a list",
    });
    expect(restored).toEqual({ docs: [suggestion()] });
    expect(normalizeAgentSuggestions(null)).toEqual({});
    expect(normalizeAgentSuggestions([])).toEqual({});
  });

  test("normalize the learning opt-out list", () => {
    expect(normalizeLearningDisabled(["a", "a", 3, "", "b"])).toEqual(["a", "b"]);
    expect(normalizeLearningDisabled("a")).toEqual([]);
  });
});
