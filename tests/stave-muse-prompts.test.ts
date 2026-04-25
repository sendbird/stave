import { describe, expect, test } from "bun:test";
import {
  buildStaveMuseInstructionContextPart,
  buildStaveMuseRouterPrompt,
  DEFAULT_STAVE_MUSE_CHAT_PROMPT,
  DEFAULT_STAVE_MUSE_PLANNER_PROMPT,
  DEFAULT_STAVE_MUSE_ROUTER_PROMPT,
  STAVE_MUSE_OPERATING_CONTRACT,
} from "@/lib/stave-muse-prompts";

describe("stave muse prompts", () => {
  test("builds the router prompt with instructions, context, and user input", () => {
    const prompt = buildStaveMuseRouterPrompt({
      instructionPrompt: DEFAULT_STAVE_MUSE_ROUTER_PROMPT,
      contextSnapshot: "workspace: release",
      userRequest: "open settings",
    });

    expect(prompt).toContain(DEFAULT_STAVE_MUSE_ROUTER_PROMPT);
    expect(prompt).toContain(STAVE_MUSE_OPERATING_CONTRACT);
    expect(prompt).toContain("Current Stave context:");
    expect(prompt).toContain("workspace: release");
    expect(prompt).toContain("User request:");
    expect(prompt).toContain("open settings");
  });

  test("omits the instruction block when the router prompt is empty", () => {
    const prompt = buildStaveMuseRouterPrompt({
      instructionPrompt: "   ",
      contextSnapshot: "workspace: release",
      userRequest: "open settings",
    });

    expect(prompt).not.toContain("You route requests for the Stave Muse widget.");
    expect(prompt).toContain(STAVE_MUSE_OPERATING_CONTRACT);
    expect(prompt).toContain("Current Stave context:");
  });

  test("builds a chat instruction context part", () => {
    expect(buildStaveMuseInstructionContextPart({
      mode: "chat",
      prompt: DEFAULT_STAVE_MUSE_CHAT_PROMPT,
    })).toEqual({
      type: "retrieved_context",
      sourceId: "stave:muse-chat-prompt",
      title: "Stave Muse Chat Instructions",
      content: `${STAVE_MUSE_OPERATING_CONTRACT}\n\n${DEFAULT_STAVE_MUSE_CHAT_PROMPT}`,
    });
  });

  test("builds a planner instruction context part", () => {
    expect(buildStaveMuseInstructionContextPart({
      mode: "planner",
      prompt: DEFAULT_STAVE_MUSE_PLANNER_PROMPT,
    })).toEqual({
      type: "retrieved_context",
      sourceId: "stave:muse-planner-prompt",
      title: "Stave Muse Planner Instructions",
      content: `${STAVE_MUSE_OPERATING_CONTRACT}\n\n${DEFAULT_STAVE_MUSE_PLANNER_PROMPT}`,
    });
  });

  test("keeps the operating contract when the prompt is empty", () => {
    expect(buildStaveMuseInstructionContextPart({
      mode: "chat",
      prompt: " \n ",
    })).toEqual({
      type: "retrieved_context",
      sourceId: "stave:muse-chat-prompt",
      title: "Stave Muse Chat Instructions",
      content: STAVE_MUSE_OPERATING_CONTRACT,
    });
  });
});
