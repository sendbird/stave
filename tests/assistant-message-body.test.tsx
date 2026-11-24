import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { replayProviderEventsToTaskState } from "@/lib/session/provider-event-replay";
import type { ChatMessage, ToolUsePart } from "@/types/chat";

function createAssistantMessage(
  args: Partial<
    Pick<
      ChatMessage,
      "content" | "parts" | "displayContent" | "displayParts" | "isStreaming"
    >
  >,
): Pick<
  ChatMessage,
  "content" | "parts" | "displayContent" | "displayParts" | "isStreaming"
> {
  return {
    content: args.content ?? "",
    parts: args.parts ?? [],
    displayContent: args.displayContent,
    displayParts: args.displayParts,
    isStreaming: args.isStreaming,
  };
}

function completedReadSteps(count = 4): ToolUsePart[] {
  return Array.from({ length: count }, (_, index) => ({
    type: "tool_use",
    toolUseId: `read-${index}`,
    toolName: "Read",
    input: JSON.stringify({ path: `file-${index}.ts` }),
    state: "output-available",
    output: "read",
  }));
}

async function loadAssistantMessageBodies() {
  const localStorageStub = {
    getItem: (_key: string) => null,
    setItem: (_key: string, _value: string) => {},
    removeItem: (_key: string) => {},
    clear: () => {},
    key: (_index: number) => null,
    length: 0,
  };

  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageStub,
    configurable: true,
  });

  Object.defineProperty(globalThis, "window", {
    value: {
      api: {
        fs: {
          pickRoot: async () => ({ ok: false }),
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
      },
    },
    configurable: true,
  });

  const standardModule = await import("@/components/session/message/assistant-trace");
  return {
    AssistantMessageBody: standardModule.AssistantMessageBody,
    splitSystemEventContent: standardModule.splitSystemEventContent,
  };
}

describe("AssistantMessageBody", () => {
  test("restores the reply and the folded step count in a finished trace", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const text = "Fixed the missing redirect guard.";
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({ parts: [
        ...completedReadSteps(),
        { type: "text", text },
      ] }), taskId: "parent", messageId: "reply", streamingEnabled: false,
    }));
    expect(html).not.toContain("Work history");
    expect(html).toContain("Fixed the missing redirect guard");
    expect(html).toContain(">Finished<");
    expect(html).toContain(">4 steps<");
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*data-trace-anchor="header"/);
    expect(html).not.toContain('data-tool-use-id="read-0"');
  });

  test("folds short traces too and keeps a failed tool step out of the header", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const parts: ToolUsePart[] = [
      ...completedReadSteps(2),
      { type: "tool_use", toolUseId: "failure", toolName: "Bash", input: "bun test", state: "output-error", output: "failed" },
    ];
    const render = (revealToolUseId?: string) => renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({ parts }), taskId: "parent", messageId: "reply", streamingEnabled: false,
      revealToolUseId,
    }));
    const folded = render();
    expect(folded).toContain(">Finished<");
    expect(folded).toContain(">3 steps<");
    expect(folded).not.toContain("failed step");
    expect(folded).not.toContain('data-tool-use-id="read-0"');
    expect(folded).not.toContain('data-tool-use-id="failure"');
    const opened = render("failure");
    expect(opened).toMatch(/data-tool-use-id="read-0"[\s\S]*?data-tool-use-id="read-1"[\s\S]*?data-tool-use-id="failure"/);
    expect(opened).toMatch(/data-tool-use-id="failure"[\s\S]*?data-tool-run-status="failed"/);
  });

  test("a pending question stays visible when history is manually collapsed", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({ isStreaming: true, parts: [
        ...completedReadSteps(),
        { type: "user_input", requestId: "question-1", toolName: "request_user_input", state: "input-requested",
          questions: [{ key: "scope", header: "Scope", question: "Include the narrow layout?", options: [] }] },
      ] }), taskId: "parent", messageId: "reply", streamingEnabled: true, traceExpansionMode: "manual",
    }));
    expect(html.split("Include the narrow layout?")).toHaveLength(2);
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*data-trace-anchor="header"/);
    expect(html).not.toContain('data-tool-use-id="read-0"');
  });

  describe("text after an answered question", () => {
    const question = {
      type: "user_input" as const, requestId: "question-1", toolName: "AskUserQuestion", state: "input-responded" as const,
      questions: [{ key: "deps", header: "Dependencies", question: "Install the shared node_modules?", options: [] }],
      answers: { deps: "I installed it myself." },
    };
    const reply = "Committed. Rebasing on main next.";
    const render = async (args: { isStreaming: boolean; followedByTool?: boolean }) => {
      const { AssistantMessageBody } = await loadAssistantMessageBodies();
      return renderToStaticMarkup(createElement(AssistantMessageBody, {
        message: createAssistantMessage({ isStreaming: args.isStreaming, parts: [
          { type: "tool_use", toolName: "Bash", input: "git commit", state: "output-available", output: "hook failed" },
          question,
          { type: "text", text: reply },
          ...(args.followedByTool
            ? [{ type: "tool_use" as const, toolName: "Bash", input: "git rebase main", state: "input-available" as const }]
            : []),
        ] }), taskId: "parent", messageId: "reply", streamingEnabled: true, showInterimMessages: true,
      }));
    };
    const replyIsAboveQuestion = (html: string) => {
      expect(html.split(reply)).toHaveLength(2);
      return html.indexOf(reply) < html.indexOf("Install the shared node_modules?");
    };

    test("streams above the pinned question, where it stays when the next tool call makes it interim", async () => {
      expect(replyIsAboveQuestion(await render({ isStreaming: true }))).toBe(true);
      expect(replyIsAboveQuestion(await render({ isStreaming: true, followedByTool: true }))).toBe(true);
    });

    test("settles below the question once the turn ends", async () => {
      expect(replyIsAboveQuestion(await render({ isStreaming: false }))).toBe(false);
    });
  });

  test("read-only past questions cannot submit or deny an answer", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({ parts: [{
        type: "user_input", requestId: "past-question", toolName: "request_user_input", state: "input-requested",
        questions: [{ key: "scope", header: "Scope", question: "Include tests?", required: false, options: [] }],
      }] }), taskId: "parent", messageId: "past", streamingEnabled: false, readOnly: true,
    }));
    expect(html).toContain("Include tests?");
    const buttons = html.match(/<button[^>]*>/g) ?? [];
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every((button) => button.includes('disabled=""'))).toBe(true);
  });

  test("renders display parts instead of raw provider prompt content", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        content: "Selector: body > div\nHTML:\n<div>raw</div>",
        parts: [
          {
            type: "text",
            text: "Selector: body > div\nHTML:\n<div>raw</div>",
          },
        ],
        displayParts: [
          {
            type: "text",
            text: "이게 왜이래",
          },
        ],
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: false,
    }));

    expect(html).toContain("이게 왜이래");
    expect(html).not.toContain("Comment:");
    expect(html).not.toContain("Selector:");
    expect(html).not.toContain("body &gt; div");
    expect(html).not.toContain("HTML:");
  });

  test("preserves visual comment display part order", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        content: "raw prompt",
        parts: [{ type: "text", text: "raw prompt" }],
        displayParts: [
          {
            type: "image_context",
            dataUrl: "data:image/png;base64,abc",
            label: "야호",
            mimeType: "image/png",
          },
        ],
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: false,
    }));

    expect(html).toContain('alt="야호"');
    expect(html).toContain(">야호</p>");
    expect(html).not.toContain("Visual comment 1");
    expect(html).not.toContain("Comment:");
    expect(html).not.toContain("raw prompt");
  });

  test("shows only the static thinking header before the first streaming trace entry arrives", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        isStreaming: true,
        parts: [],
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
    }));

    expect(html).not.toContain("Thinking...</p>");
    expect(html).not.toContain("No response.");
    expect(html).toContain('data-trace-anchor="header"');
    expect(html).toContain(">Thinking<");
    expect(html).not.toContain("<button");
  });

  test("renders the reasoning step once thinking content arrives", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        isStreaming: true,
        parts: [{ type: "thinking", text: "Inspecting files.", isStreaming: true }],
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
      traceExpansionMode: "auto",
    }));

    expect(html).toContain('data-thinking-status="thinking"');
    expect(html).not.toContain("Inspecting files.");
    // The trace header and the reasoning row.
    expect(html.match(/<button/g)?.length ?? 0).toBe(2);
  });

  test("does not repeat a one-line system event inside its accordion", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const contextWindowNotice = "Context window at 62% — compaction not required.";
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        isStreaming: true,
        parts: [{ type: "system_event", content: contextWindowNotice }],
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
      traceExpansionMode: "auto",
    }));

    expect(html.match(/Context window at 62%/g)?.length ?? 0).toBe(1);
    // Only the trace header is a button; the one-line notice has no accordion.
    expect(html.match(/<button/g)?.length ?? 0).toBe(1);
  });

  test("does not repeat other one-line provider notices inside their accordions", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const notices = [
      "Compacting conversation context…",
      "Approaching rate limit (72% used). Consider pacing requests.",
      "Plugin installed: image-tools",
    ];

    for (const notice of notices) {
      const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
        message: createAssistantMessage({
          isStreaming: true,
          parts: [{ type: "system_event", content: notice }],
        }),
        taskId: "task-1",
        messageId: "message-1",
        streamingEnabled: true,
        traceExpansionMode: "auto",
      }));

      expect(html.split(notice).length - 1).toBe(1);
    }
  });

  test("keeps the heading out of a multi-line provider notice body", async () => {
    const { splitSystemEventContent } = await loadAssistantMessageBodies();
    expect(splitSystemEventContent(
      "Provider warning\nThe provider returned a recoverable warning. Expand for the detailed reason.",
    )).toEqual({
      title: "Provider warning",
      detail: "The provider returned a recoverable warning. Expand for the detailed reason.",
    });
  });

  test("does not repeat a Codex turn checkpoint inside its accordion", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const checkpointNotice = "Checkpoint captured before Codex turn.";
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        isStreaming: true,
        parts: [{
          type: "system_event",
          content: checkpointNotice,
          compactBoundary: { trigger: "turn_start", gitRef: "abc123" },
        }],
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
      traceExpansionMode: "auto",
    }));

    expect(html.split(checkpointNotice).length - 1).toBe(1);
    expect(html).toContain("Workspace checkpoint");
    expect(html).toContain("Restore");
  });

  test("uses Stave-specific copy and icon without rewriting external MCP names", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        isStreaming: true,
        parts: [
          {
            type: "tool_use",
            toolName: "stave-local:stave_lens_evaluate",
            input: JSON.stringify({ expression: "document.title" }),
            output: "Agent trace preview",
            state: "output-available",
          },
          {
            type: "tool_use",
            toolName: "mcp__github__get_file_contents",
            input: JSON.stringify({ owner: "sendbird", repo: "stave" }),
            output: "file contents",
            state: "output-available",
          },
          {
            type: "tool_use",
            toolName: "mcp__stave-docs__search",
            input: JSON.stringify({ query: "agent messages" }),
            output: "external search results",
            state: "output-available",
          },
        ],
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
      traceExpansionMode: "auto",
    }));

    expect(html).toContain("Check page state");
    expect(html).not.toContain("stave-local:stave_lens_evaluate");
    expect(html).toContain("stave-logo.svg");
    expect(html.match(/stave-logo\.svg/g)).toHaveLength(1);
    expect(html).toContain("mcp__github__get_file_contents");
    expect(html).not.toContain("Get file contents");
    expect(html).toContain("mcp__stave-docs__search");
    expect(html).not.toContain(">Search<");
  });

  test("defers streaming reasoning text until the reader opens it", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        isStreaming: true,
        parts: [{ type: "thinking", text: "Open https://example.com/docs.", isStreaming: true }],
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
    }));

    expect(html).not.toContain("https://example.com/docs");
    expect(html).not.toContain("<a");
  });

  test("reads finished wall-clock time in the trace header without rounding it up", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const render = (spanMs: number) => renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: {
        ...createAssistantMessage({
          parts: [...completedReadSteps(), { type: "text", text: "Done." }],
        }),
        startedAt: new Date(0).toISOString(),
        completedAt: new Date(spanMs).toISOString(),
      },
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
    }));
    expect(render(59_900)).toContain(">Worked for 59s<");
    expect(render(59_900)).toContain(">4 steps<");
    expect(render(400)).toContain(">Worked for &lt;1s<");
  });

  test("keeps a running trace to its header in manual expansion mode", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        isStreaming: true,
        parts: [
          ...completedReadSteps(),
          { type: "thinking", text: "Inspecting files.", isStreaming: true },
        ],
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
      traceExpansionMode: "manual",
    }));

    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*data-trace-anchor="header"/);
    expect(html).not.toContain('data-tool-use-id="read-0"');
    expect(html).not.toContain('data-thinking-status="thinking"');
    expect(html).not.toContain("Inspecting files.");
  });

  test("keeps markdown rendering for a replayed assistant message", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const replayed = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [],
      events: [
        { type: "text", text: "## Review\n\n- Keep markdown\n- Preserve bullets" },
        { type: "done" },
      ],
      provider: "codex",
      model: "gpt-5.4",
    });

    const priorAssistantMessage = replayed.messages[0];
    if (!priorAssistantMessage) {
      throw new Error("expected prior assistant message");
    }

    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: priorAssistantMessage,
      taskId: "task-1",
      messageId: priorAssistantMessage.id,
      streamingEnabled: true,
    }));

    expect(html).toContain("<h2");
    expect(html).toContain("<ul");
    expect(html).toContain("Keep markdown");
  });

  test("hides finished interim prose in folded history by default", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        parts: [
          { type: "text", text: "Inspecting the repo.", segmentId: "commentary-1" },
          ...completedReadSteps(),
          { type: "text", text: "Patched the issue.", segmentId: "final-1" },
        ],
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
    }));

    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*data-trace-anchor="header"/);
    expect(html).not.toContain("Inspecting the repo.");
    expect(html).toContain("Patched the issue.");
  });

  test("keeps a running trace to its latest interim message and opens collapsed rows in auto mode", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const render = (traceExpansionMode: "auto" | "manual") => renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        isStreaming: true,
        parts: [
          { type: "text", text: "Earlier update." },
          ...completedReadSteps(),
          { type: "text", text: "Inspecting the repo." },
          {
            type: "thinking",
            text: "Comparing the two migrations.",
            isStreaming: true,
          },
          {
            type: "tool_use",
            toolUseId: "tool-read",
            toolName: "Read",
            input: JSON.stringify({ path: "README.md" }),
            output: "# Stave",
            state: "input-available",
          },
          {
            type: "tool_use",
            toolUseId: "tool-bash-fail",
            toolName: "Bash",
            input: JSON.stringify({ command: "bun test" }),
            output: "1 fail",
            state: "output-error",
          },
        ],
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
      traceExpansionMode,
    }));

    const folded = render("manual");
    expect(folded).toContain("Inspecting the repo.");
    expect(folded).not.toContain("Earlier update.");
    expect(folded).toMatch(/<button[^>]*aria-expanded="false"[^>]*data-trace-anchor="header"/);
    expect(folded).not.toContain('data-thinking-status="thinking"');
    expect(folded).not.toContain('data-tool-run-status="running"');
    expect(folded).not.toContain('data-tool-run-status="failed"');

    const open = render("auto");
    expect(open).toMatch(/<button[^>]*aria-expanded="true"[^>]*data-trace-anchor="header"/);
    expect(open).toMatch(/Earlier update\.[\s\S]*?Inspecting the repo\.[\s\S]*?data-thinking-status="thinking"[\s\S]*?data-tool-run-status="running"[\s\S]*?data-tool-run-status="failed"/);
    expect(open).toMatch(/data-thinking-status="thinking"[\s\S]*?aria-expanded="false"/);
    expect(open).toMatch(/data-tool-run-status="running"[\s\S]*?aria-expanded="false"/);
    expect(open).toMatch(/data-tool-run-status="failed"[\s\S]*?aria-expanded="false"/);
  });

  test("keeps Stave MCP capture and snapshot rows collapsed unless the reader opens them", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const screenshotOutput = `data:image/png;base64,${"A".repeat(400)}`;
    const snapshotOutput = [
      "RootWebArea url=https://example.test",
      '  button "Save screenshot" [ref=d1e12]',
      "  img Capture screen",
    ].join("\n");
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        isStreaming: true,
        parts: [
          {
            type: "tool_use",
            toolUseId: "tool-screenshot",
            toolName: "mcp__stave-local-mcp__stave_lens_screenshot",
            input: JSON.stringify({ selector: "main" }),
            output: screenshotOutput,
            state: "output-available",
          },
          {
            type: "tool_use",
            toolUseId: "tool-snapshot",
            toolName: "mcp__stave-local-mcp__stave_lens_snapshot",
            input: JSON.stringify({ includeFrames: true }),
            output: snapshotOutput,
            state: "input-streaming",
          },
        ],
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
      traceExpansionMode: "auto",
    }));

    expect(html).toContain("Capture screen");
    expect(html).toContain("Inspect page");
    expect(html).toMatch(
      /data-tool-run-status="done"[\s\S]*?aria-expanded="false"/,
    );
    expect(html).toMatch(
      /data-tool-run-status="running"[\s\S]*?aria-expanded="false"/,
    );
    expect(html).not.toMatch(
      /data-tool-run-status="(?:done|running)"[\s\S]*?aria-expanded="true"/,
    );
  });

  test("draws a display-list tool call with the trace's row, collapsed, deferring its streaming output", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const screenshotOutput = `data:image/png;base64,${"B".repeat(400)}`;
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        displayParts: [
          {
            type: "tool_use",
            toolUseId: "tool-screenshot",
            toolName: "mcp__stave-local-mcp__stave_lens_screenshot",
            input: JSON.stringify({ selector: "main" }),
            output: screenshotOutput,
            state: "input-streaming",
          },
        ],
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
    }));

    // The same AUI row as the trace: closed unless the reader opens it.
    expect(html).toContain("Capture screen");
    expect(html).toMatch(
      /data-tool-run-status="running"[\s\S]*?aria-expanded="false"/,
    );
    expect(html).not.toContain('aria-expanded="true"');
    expect(html).not.toContain("Live output");
    expect(html).not.toContain(screenshotOutput);
  });

  test("opens folded history for finished interim messages when enabled", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        parts: [
          { type: "text", text: "Inspecting the repo.", segmentId: "commentary-1" },
          ...completedReadSteps(),
          { type: "text", text: "Patched the issue.", segmentId: "final-1" },
        ],
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
      showInterimMessages: true,
    }));

    expect(html).toMatch(/<button[^>]*aria-expanded="true"[^>]*data-trace-anchor="header"/);
    expect(html).toContain("Inspecting the repo.");
    expect(html).toContain("Patched the issue.");
  });


  test("the finished trace header starts with the reasoning mark and ends with the step count", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({ parts: completedReadSteps() }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
    }));

    const header = html.match(/<button[^>]*data-trace-anchor="header"[^>]*>[\s\S]*?<\/button>/)?.[0];
    const historyId = header?.match(/aria-controls="([^"]+)"/)?.[1];
    expect(historyId).toBeDefined();
    expect(html).toContain(`id="${historyId}" hidden=""`);
    expect(header).toMatch(/^<button[^>]*><span[^>]*data-aui-inline-disclosure-icon=""[\s\S]*?lucide-brain/);
    expect(header).toMatch(/4 steps<\/span><\/button>$/);
  });

  /*
   * The changed-file row is `ToolRun`, the same primitive as every other call
   * on the rail — not the host `ChainOfThoughtStep` it used to be, which put
   * its chevron on the trailing edge and sized its glyph in `em`. These pin the
   * two halves of that: the AUI row anatomy is present, and the pending /
   * rejected state is reported through `AgentStepState` rather than a local
   * open flag, so `isActionRequiredState` decides which rows stay open.
   */
  test("renders a changed file as an AUI tool run row awaiting approval", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        parts: [
          {
            type: "code_diff",
            filePath: "src/lib/example.ts",
            oldContent: "const a = 1;\n",
            newContent: "const a = 2;\nconst b = 3;\n",
            status: "pending",
          },
        ],
        /* The trace auto-opens only while the turn streams, and a settled turn
           renders the diff through the block below the trace instead. */
        isStreaming: true,
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
    }));

    expect(html).toContain("Changed file");
    // The AUI row, keyed by the state the whole family shares.
    expect(html).toContain('data-tool-run-status="approval"');
    expect(html).toContain("Awaiting approval");
    // The disclosure's leading glyph slot, which is what swaps for the chevron.
    expect(html).toContain("atelier-inline-disclosure-trigger");
  });

  test("reports an entirely rejected changed-file row as denied", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        parts: [
          {
            type: "code_diff",
            filePath: "src/lib/example.ts",
            oldContent: "const a = 1;\n",
            newContent: "const a = 2;\n",
            status: "rejected",
          },
        ],
        isStreaming: true,
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
      traceExpansionMode: "auto",
    }));

    expect(html).toContain('data-tool-run-status="denied"');
    expect(html).not.toContain('data-tool-run-status="approval"');
  });

  test("reports an accepted changed-file row as completed", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        parts: [
          {
            type: "code_diff",
            filePath: "src/lib/example.ts",
            oldContent: "const a = 1;\n",
            newContent: "const a = 2;\n",
            status: "accepted",
          },
        ],
        isStreaming: true,
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
      traceExpansionMode: "auto",
    }));

    expect(html).toContain('data-tool-run-status="completed"');
  });

  test("a read-only past turn shows changed files without a pending state to accept or reject", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const render = (readOnly: boolean) =>
      renderToStaticMarkup(createElement(AssistantMessageBody, {
        message: createAssistantMessage({
          parts: [
            {
              type: "code_diff",
              filePath: "src/lib/example.ts",
              oldContent: "const a = 1;\n",
              newContent: "const a = 2;\n",
              status: "pending",
            },
          ],
        }),
        taskId: "task-1",
        messageId: "message-1",
        streamingEnabled: false,
        traceExpansionMode: "manual",
        readOnly,
      }));

    // Accept and Reject live in the expanded row; the pending count gates them.
    expect(render(false)).toContain("1 pending");
    const html = render(true);
    expect(html).toContain("example.ts");
    expect(html).toContain("Open in editor");
    expect(html).not.toContain("pending");
  });
});
