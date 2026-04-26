import { describe, expect, test } from "bun:test";
import {
  findPendingApprovals,
  findLatestPendingApproval,
  findLatestPendingApprovalPart,
  findPendingApprovalMessageByRequestId,
  findLatestPendingUserInputPart,
  hasRenderableAssistantContent,
  interruptPendingToolInteractionParts,
  interruptPendingToolInteractionsInMessages,
  mergePromptSuggestions,
  mergeToolResultIntoPart,
  resolvePendingToolInteractionPartsByRequestId,
  updateApprovalPartsByRequestId,
  updateUserInputPartsByRequestId,
} from "@/store/provider-message.utils";

describe("hasRenderableAssistantContent", () => {
  test("treats tool-only messages as renderable", () => {
    expect(hasRenderableAssistantContent({
      message: {
        content: "",
        isPlanResponse: false,
        parts: [{
          type: "tool_use",
          toolUseId: "tool-1",
          toolName: "bash",
          input: "ls",
          output: "file.txt",
          state: "output-available",
        }],
      },
    })).toBe(true);
  });

  test("returns false for genuinely empty assistant messages", () => {
    expect(hasRenderableAssistantContent({
      message: {
        content: "",
        isPlanResponse: false,
        parts: [],
      },
    })).toBe(false);
  });
});

describe("mergePromptSuggestions", () => {
  test("appends new suggestions without losing earlier values", () => {
    expect(mergePromptSuggestions({
      existing: ["Open a PR"],
      incoming: ["Refactor next", "Open a PR"],
    })).toEqual([
      "Open a PR",
      "Refactor next",
    ]);
  });
});

describe("mergeToolResultIntoPart", () => {
  test("keeps partial tool updates in an active state", () => {
    expect(mergeToolResultIntoPart({
      part: {
        type: "tool_use",
        toolUseId: "tool-1",
        toolName: "bash",
        input: "npm test",
        state: "input-available",
      },
      event: {
        tool_use_id: "tool-1",
        output: "running",
        isPartial: true,
      },
    })).toMatchObject({
      type: "tool_use",
      output: "running",
      state: "input-streaming",
    });
  });

  test("marks final tool results as completed", () => {
    expect(mergeToolResultIntoPart({
      part: {
        type: "tool_use",
        toolUseId: "tool-1",
        toolName: "bash",
        input: "npm test",
        state: "input-streaming",
      },
      event: {
        tool_use_id: "tool-1",
        output: "done",
      },
    })).toMatchObject({
      type: "tool_use",
      output: "done",
      state: "output-available",
    });
  });
});

describe("findLatestPendingApprovalPart", () => {
  test("prefers the latest still-pending approval in a message", () => {
    expect(findLatestPendingApprovalPart({
      message: {
        parts: [
          {
            type: "approval",
            toolName: "Skill",
            description: "old",
            requestId: "req-old",
            state: "approval-responded",
          },
          {
            type: "approval",
            toolName: "Read",
            description: "new",
            requestId: "req-new",
            state: "approval-requested",
          },
        ],
      },
    })).toMatchObject({
      requestId: "req-new",
      state: "approval-requested",
    });
  });
});

describe("findLatestPendingApproval", () => {
  test("finds the newest pending approval across messages", () => {
    expect(findLatestPendingApproval({
      messages: [
        {
          id: "message-1",
          role: "assistant",
          model: "codex",
          providerId: "codex",
          content: "",
          parts: [{
            type: "approval",
            toolName: "Read",
            description: "older",
            requestId: "req-old",
            state: "approval-requested",
          }],
        },
        {
          id: "message-2",
          role: "assistant",
          model: "codex",
          providerId: "codex",
          content: "",
          parts: [{
            type: "approval",
            toolName: "Bash",
            description: "newer",
            requestId: "req-new",
            state: "approval-requested",
          }],
        },
      ],
    })).toMatchObject({
      messageId: "message-2",
      part: {
        requestId: "req-new",
        state: "approval-requested",
      },
    });
  });
});

describe("findPendingApprovals", () => {
  test("returns every pending approval newest-first across messages", () => {
    expect(findPendingApprovals({
      messages: [
        {
          id: "message-1",
          role: "assistant",
          model: "codex",
          providerId: "codex",
          content: "",
          parts: [
            {
              type: "approval",
              toolName: "Read",
              description: "older",
              requestId: "req-old",
              state: "approval-requested",
            },
            {
              type: "approval",
              toolName: "Read",
              description: "ignored",
              requestId: "req-ignored",
              state: "approval-responded",
            },
          ],
        },
        {
          id: "message-2",
          role: "assistant",
          model: "codex",
          providerId: "codex",
          content: "",
          parts: [
            {
              type: "approval",
              toolName: "Bash",
              description: "earlier in same message",
              requestId: "req-earlier",
              state: "approval-requested",
            },
            {
              type: "approval",
              toolName: "Write",
              description: "latest in same message",
              requestId: "req-latest",
              state: "approval-requested",
            },
          ],
        },
      ],
    })).toEqual([
      {
        messageId: "message-2",
        part: {
          type: "approval",
          toolName: "Write",
          description: "latest in same message",
          requestId: "req-latest",
          state: "approval-requested",
        },
      },
      {
        messageId: "message-2",
        part: {
          type: "approval",
          toolName: "Bash",
          description: "earlier in same message",
          requestId: "req-earlier",
          state: "approval-requested",
        },
      },
      {
        messageId: "message-1",
        part: {
          type: "approval",
          toolName: "Read",
          description: "older",
          requestId: "req-old",
          state: "approval-requested",
        },
      },
    ]);
  });
});

describe("findPendingApprovalMessageByRequestId", () => {
  test("finds the pending approval and its parent message id", () => {
    expect(findPendingApprovalMessageByRequestId({
      requestId: "req-target",
      messages: [
        {
          id: "message-1",
          role: "assistant",
          model: "codex",
          providerId: "codex",
          content: "",
          parts: [{
            type: "approval",
            toolName: "Skill",
            description: "old",
            requestId: "req-old",
            state: "approval-requested",
          }],
        },
        {
          id: "message-2",
          role: "assistant",
          model: "codex",
          providerId: "codex",
          content: "",
          parts: [{
            type: "approval",
            toolName: "Bash",
            description: "current",
            requestId: "req-target",
            state: "approval-requested",
          }],
        },
      ],
    })).toMatchObject({
      messageId: "message-2",
      part: {
        requestId: "req-target",
        state: "approval-requested",
      },
    });
  });
});

describe("findLatestPendingUserInputPart", () => {
  test("prefers the latest still-pending user input request in a message", () => {
    expect(findLatestPendingUserInputPart({
      message: {
        parts: [
          {
            type: "user_input",
            toolName: "AskUserQuestion",
            requestId: "req-old",
            questions: [{
              question: "Old?",
              header: "Old",
              options: [{ label: "A", description: "a" }],
            }],
            answers: { old: "A" },
            state: "input-responded",
          },
          {
            type: "user_input",
            toolName: "AskUserQuestion",
            requestId: "req-new",
            questions: [{
              question: "New?",
              header: "New",
              options: [{ label: "B", description: "b" }],
            }],
            state: "input-requested",
          },
        ],
      },
    })).toMatchObject({
      requestId: "req-new",
      state: "input-requested",
    });
  });
});

describe("updateApprovalPartsByRequestId", () => {
  test("updates only the matching approval part", () => {
    expect(updateApprovalPartsByRequestId({
      requestId: "req-new",
      approved: true,
      parts: [
        {
          type: "approval",
          toolName: "Skill",
          description: "old",
          requestId: "req-old",
          state: "approval-requested",
        },
        {
          type: "approval",
          toolName: "Read",
          description: "new",
          requestId: "req-new",
          state: "approval-requested",
        },
      ],
    })).toEqual([
      {
        type: "approval",
        toolName: "Skill",
        description: "old",
        requestId: "req-old",
        state: "approval-requested",
      },
      {
        type: "approval",
        toolName: "Read",
        description: "new",
        requestId: "req-new",
        state: "approval-responded",
      },
    ]);
  });
});

describe("updateUserInputPartsByRequestId", () => {
  test("updates only the matching user input part", () => {
    expect(updateUserInputPartsByRequestId({
      requestId: "req-new",
      answers: { answer: "B" },
      parts: [
        {
          type: "user_input",
          toolName: "AskUserQuestion",
          requestId: "req-old",
          questions: [{
            question: "Old?",
            header: "Old",
            options: [{ label: "A", description: "a" }],
          }],
          state: "input-requested",
        },
        {
          type: "user_input",
          toolName: "AskUserQuestion",
          requestId: "req-new",
          questions: [{
            question: "New?",
            header: "New",
            options: [{ label: "B", description: "b" }],
          }],
          state: "input-requested",
        },
      ],
    })).toEqual([
      {
        type: "user_input",
        toolName: "AskUserQuestion",
        requestId: "req-old",
        questions: [{
          question: "Old?",
          header: "Old",
          options: [{ label: "A", description: "a" }],
        }],
        state: "input-requested",
      },
      {
        type: "user_input",
        toolName: "AskUserQuestion",
        requestId: "req-new",
        questions: [{
          question: "New?",
          header: "New",
          options: [{ label: "B", description: "b" }],
        }],
        answers: { answer: "B" },
        state: "input-responded",
      },
    ]);
  });
});

describe("interruptPendingToolInteractionParts", () => {
  test("marks pending approvals and user-input requests as interrupted", () => {
    expect(interruptPendingToolInteractionParts({
      parts: [
        {
          type: "approval",
          toolName: "Bash",
          description: "Run command",
          requestId: "approval-1",
          state: "approval-requested",
        },
        {
          type: "approval",
          toolName: "Read",
          description: "Already answered",
          requestId: "approval-2",
          state: "approval-responded",
        },
        {
          type: "user_input",
          toolName: "AskUserQuestion",
          requestId: "input-1",
          questions: [{
            question: "Continue?",
            header: "Confirm",
            options: [{ label: "Yes", description: "continue" }],
          }],
          state: "input-requested",
        },
      ],
    })).toEqual([
      {
        type: "approval",
        toolName: "Bash",
        description: "Run command",
        requestId: "approval-1",
        state: "approval-interrupted",
      },
      {
        type: "approval",
        toolName: "Read",
        description: "Already answered",
        requestId: "approval-2",
        state: "approval-responded",
      },
      {
        type: "user_input",
        toolName: "AskUserQuestion",
        requestId: "input-1",
        questions: [{
          question: "Continue?",
          header: "Confirm",
          options: [{ label: "Yes", description: "continue" }],
        }],
        state: "input-interrupted",
      },
    ]);
  });
});

describe("interruptPendingToolInteractionsInMessages", () => {
  test("returns the original array when there are no pending tool interactions", () => {
    const messages = [{
      id: "message-1",
      role: "assistant" as const,
      model: "codex",
      providerId: "codex" as const,
      content: "",
      parts: [{
        type: "approval" as const,
        toolName: "Read",
        description: "Already handled",
        requestId: "approval-1",
        state: "approval-responded" as const,
      }],
    }];

    expect(interruptPendingToolInteractionsInMessages({ messages })).toBe(messages);
  });
});

describe("resolvePendingToolInteractionPartsByRequestId", () => {
  test("marks matching pending approval and user input parts as responded", () => {
    expect(resolvePendingToolInteractionPartsByRequestId({
      requestId: "tool-1",
      parts: [
        {
          type: "approval",
          toolName: "Bash",
          description: "Run command",
          requestId: "tool-1",
          state: "approval-requested",
        },
        {
          type: "user_input",
          toolName: "AskUserQuestion",
          requestId: "tool-1",
          questions: [{
            question: "Continue?",
            header: "Confirm",
            options: [{ label: "Yes", description: "continue" }],
          }],
          state: "input-requested",
        },
      ],
    })).toEqual([
      {
        type: "approval",
        toolName: "Bash",
        description: "Run command",
        requestId: "tool-1",
        state: "approval-responded",
      },
      {
        type: "user_input",
        toolName: "AskUserQuestion",
        requestId: "tool-1",
        questions: [{
          question: "Continue?",
          header: "Confirm",
          options: [{ label: "Yes", description: "continue" }],
        }],
        state: "input-responded",
      },
    ]);
  });

  test("returns the original array when there is no matching pending interaction", () => {
    const parts = [{
      type: "approval" as const,
      toolName: "Read",
      description: "Inspect file",
      requestId: "tool-2",
      state: "approval-requested" as const,
    }];

    expect(resolvePendingToolInteractionPartsByRequestId({
      requestId: "tool-1",
      parts,
    })).toBe(parts);
  });
});
