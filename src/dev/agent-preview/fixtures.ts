import type { ChatMessage, MessagePart } from "@/types/chat";

/**
 * Fixtures for the dev-only agent trace preview (`?stavePreview=agent-messages`).
 * Built from the real `MessagePart` shapes so both preview columns exercise the
 * same code path production chat uses.
 */

export type PreviewMessage = Pick<
  ChatMessage,
  "content" | "parts" | "displayContent" | "displayParts" | "isStreaming" | "role"
>;

const REASONING_TEXT = [
  "The trace viewport needs to cap its height while streaming so the",
  "conversation scroller keeps a stable row height mid-turn. Using",
  "`justify-content: flex-end` on a clipped column pushes older steps off the",
  "top edge and pins the newest one to the bottom, which is the glide effect",
  "without a single measured height.",
].join(" ");

const DIFF_OLD = [
  "export function total(values: number[]) {",
  "  let sum = 0;",
  "  for (const value of values) {",
  "    sum += value;",
  "  }",
  "  return sum;",
  "}",
].join("\n");

const DIFF_NEW = [
  "export function total(values: readonly number[]) {",
  "  return values.reduce((sum, value) => sum + value, 0);",
  "}",
].join("\n");

function commonParts(args: { reasoningStreaming: boolean }): MessagePart[] {
  return [
    {
      type: "thinking",
      text: REASONING_TEXT,
      isStreaming: args.reasoningStreaming,
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: args.reasoningStreaming ? undefined : "2026-01-01T00:00:12.000Z",
    },
    {
      type: "tool_use",
      toolUseId: "tool-read",
      toolName: "Read",
      input: JSON.stringify({ file_path: "src/components/ai-elements/chain-of-thought.tsx" }),
      output: "1  import type { ButtonHTMLAttributes } from \"react\";\n2  …",
      state: "output-available",
    },
    {
      type: "tool_use",
      toolUseId: "tool-grep",
      toolName: "Grep",
      input: JSON.stringify({ pattern: "animate-cot-step-in", path: "src" }),
      output: "src/components/ai-elements/chain-of-thought.tsx:332\nsrc/components/session/message/assistant-trace.tsx:465",
      state: "output-available",
    },
    {
      type: "tool_use",
      toolUseId: "tool-stave-lens-evaluate",
      toolName: "stave-local:stave_lens_evaluate",
      input: JSON.stringify({ expression: "document.querySelector('main')?.getBoundingClientRect().height" }),
      output: "main: 720px",
      state: "output-available",
      elapsedSeconds: 1,
    },
    {
      type: "tool_use",
      toolUseId: "tool-stave-workspace-context",
      toolName: "mcp__stave-local-mcp__stave_get_workspace_information",
      input: JSON.stringify({ include: "summary" }),
      output: "Workspace context loaded.",
      state: "output-available",
    },
    {
      /* A similarly named third-party server must retain the generic tool icon
         and raw identity rather than inheriting Stave branding. */
      type: "tool_use",
      toolUseId: "tool-external-stave-docs",
      toolName: "mcp__stave-docs__search",
      input: JSON.stringify({ query: "agent messages" }),
      output: "3 external documentation results.",
      state: "output-available",
    },
    {
      type: "tool_use",
      toolUseId: "tool-bash",
      toolName: "Bash",
      input: JSON.stringify({ command: "bun run typecheck" }),
      output: "$ tsc --noEmit",
      state: "output-available",
    },
    {
      /* Exercises the ToolResult error path: failure badge on the collapsed
         row, destructive output body, and no auto-collapse. */
      type: "tool_use",
      toolUseId: "tool-bash-fail",
      toolName: "Bash",
      input: JSON.stringify({ command: "bun run test:ci", timeout: 120_000 }),
      output: "error: 1 test failed\n  tests/chain-of-thought-viewport.test.tsx:48",
      state: "output-error",
      elapsedSeconds: 34,
    },
    {
      type: "tool_use",
      toolUseId: "tool-agent",
      toolName: "Task",
      input: JSON.stringify({
        subagent_type: "Explore",
        description: "Map trace motion call sites",
        prompt: "Find every call site that applies a chain-of-thought motion utility class.",
      }),
      output: "4 call sites across 2 files.",
      progressMessages: [
        "Scanning src/components/ai-elements",
        "Scanning src/components/session/message",
      ],
      state: "output-available",
    },
    {
      type: "tool_use",
      toolUseId: "tool-todo",
      toolName: "TodoWrite",
      input: JSON.stringify({
        todos: [
          { content: "Add motion primitives to globals.css", status: "completed" },
          { content: "Port the reasoning phrase variants", status: "completed" },
          { content: "Cap the streaming trace viewport", status: "in_progress" },
          { content: "Screenshot both columns", status: "pending" },
        ],
      }),
      state: "output-available",
    },
    {
      type: "code_diff",
      filePath: "src/lib/total.ts",
      oldContent: DIFF_OLD,
      newContent: DIFF_NEW,
      status: "accepted",
    },
    {
      type: "system_event",
      content: "Context window at 62% — compaction not required.",
    },
    {
      type: "system_event",
      content: "Approaching rate limit (72% used). Consider pacing requests.",
    },
    {
      type: "system_event",
      content: "Plugin installed: image-tools",
    },
    {
      type: "system_event",
      /* Deliberately multi-line: the first line is the row title and only the
         following detail should appear when the row is expanded. */
      content: "Provider warning\nThe provider returned a recoverable warning. Expand for the detailed reason.",
    },
  ];
}

export function createStreamingPreviewMessage(): PreviewMessage {
  return {
    role: "assistant",
    content: "",
    parts: [
      ...commonParts({ reasoningStreaming: true }),
      {
        type: "tool_use",
        toolUseId: "tool-edit",
        toolName: "Edit",
        input: JSON.stringify({ file_path: "src/globals.css" }),
        state: "input-available",
      },
    ],
    isStreaming: true,
  };
}

export function createCompletedPreviewMessage(): PreviewMessage {
  return {
    role: "assistant",
    content: "",
    parts: [
      ...commonParts({ reasoningStreaming: false }),
      {
        type: "text",
        text: [
          "Capped the streaming trace at `22em` and swapped the row entrance to the",
          "springier `trace-row-in` easing. `bun run typecheck` passes.",
        ].join(" "),
      },
    ],
    isStreaming: false,
  };
}
