import type {
  MessagePart,
  ToolUsePart,
  ApprovalPart,
  UserInputPart,
} from "@/types/chat";
import { createCompletedPreviewMessage } from "../agent-preview/fixtures";

export type EventSample = {
  title: string;
  parts: MessagePart[];
  streaming?: boolean;
};
const tool = (state: ToolUsePart["state"]): ToolUsePart => ({
  type: "tool_use",
  toolUseId: `preview-${state}`,
  toolName: "Bash",
  input: JSON.stringify({
    command:
      "bun test tests/session/very-long-file-name-for-overflow-review.test.ts --timeout 30000",
  }),
  state,
  elapsedSeconds: 3,
  output:
    state === "output-error"
      ? "error: expected 200, received 503\nService is temporarily unavailable."
      : state === "output-available"
        ? "12 pass\n0 fail\nCompleted in 2.8s"
        : undefined,
});
const approval = (state: ApprovalPart["state"]): ApprovalPart => ({
  type: "approval",
  toolName: "Bash",
  description: "Run the workspace validation command.",
  input: "bun run typecheck",
  requestId: `preview-${state}`,
  supportsAllowAlways: true,
  state,
});
const question = (state: UserInputPart["state"]): UserInputPart => ({
  type: "user_input",
  toolName: "request_user_input",
  requestId: `preview-${state}`,
  state,
  questions: [
    {
      key: "density",
      header: "Density",
      question: "Which spacing should this view use?",
      required: true,
      options: [
        {
          label: "Compact",
          description: "Keep related events close together.",
          recommended: true,
        },
        { label: "Regular", description: "Keep more space between events." },
      ],
      allowCustom: true,
    },
  ],
  answers: state === "input-responded" ? { density: "Compact" } : undefined,
});
export function createEventSamples(): EventSample[] {
  const existing = createCompletedPreviewMessage().parts ?? [];
  return [
    {
      title: "최종 답변 · Markdown · 링크/인용",
      parts: [
        {
          type: "text",
          text: "변경을 반영했습니다. **선택 상태**와 `git diff` 색상은 유지됩니다.\n\n- 알림 항목 정렬\n- Tool 헤더 말줄임\n\n참고: [1](https://example.com/reference)\n\n```ts\nconst status = 'completed';\n```",
        },
      ],
    },
    {
      title: "Interim · Tool · 최종 답변",
      parts: [
        { type: "text", text: "관련 파일의 레이아웃을 확인하고 있습니다." },
        tool("output-available"),
        { type: "text", text: "검토를 마쳤습니다. 결과를 확인해 주세요." },
      ],
    },
    {
      title: "Thinking / Reasoning · 진행 중",
      streaming: true,
      parts: [
        {
          type: "thinking",
          text: "공통 컨트롤과 호스트의 스타일이 중첩되는 지점을 확인하고 있습니다. 긴 파일명과 작은 화면에서도 같은 정렬을 유지해야 합니다.",
          isStreaming: true,
        },
      ],
    },
    {
      title: "Thinking / Reasoning · 완료",
      parts: [
        {
          type: "thinking",
          text: "안쪽 버튼의 기본 패딩이 행 정렬에 영향을 주고 있었습니다. 공통 스타일에서 수정하고 라이트·다크를 확인했습니다.",
          isStreaming: false,
          startedAt: "2026-01-01T00:00:00Z",
          completedAt: "2026-01-01T00:00:12Z",
        },
      ],
    },
    ...(
      [
        "input-streaming",
        "input-available",
        "output-available",
        "output-error",
      ] as const
    ).map((state) => ({
      title: `Tool · ${state}`,
      parts: [tool(state)],
      streaming: state.startsWith("input-"),
    })),
    {
      title: "Tool 종류 · Read / Search / MCP / Subagent / Plan",
      parts: existing.filter((p) => p.type === "tool_use"),
    },
    ...(["pending", "accepted", "rejected"] as const).map((status) => ({
      title: `File diff · ${status}`,
      parts: [
        {
          type: "code_diff" as const,
          filePath:
            "src/components/session/a-long-directory-name/message-renderer.ts",
          oldContent: "const space = 24;\nconst radius = 0;",
          newContent: "const space = 8;\nconst radius = 6;",
          status,
        },
      ],
    })),
    ...(
      [
        "approval-requested",
        "approval-responded",
        "approval-interrupted",
        "output-denied",
      ] as const
    ).map((state) => ({
      title: `Approval · ${state}`,
      parts: [approval(state)],
    })),
    ...(
      [
        "input-requested",
        "input-responded",
        "input-interrupted",
        "input-denied",
      ] as const
    ).map((state) => ({
      title: `Clarification · ${state}`,
      parts: [question(state)],
    })),
    {
      title: "시스템 알림 · 경고 · Checkpoint / Compaction",
      parts: [
        ...existing.filter((p) => p.type === "system_event"),
        {
          type: "system_event",
          content: "Compaction completed. Earlier context was summarized.",
          compactBoundary: { trigger: "context_limit" },
        },
      ],
    },
    {
      title: "참조 파일",
      parts: [
        {
          type: "file_context",
          filePath: "src/lib/example.ts",
          content: "export const enabled = true;",
          language: "typescript",
        },
      ],
    },
    { title: "응답 대기 · 아직 이벤트 없음", streaming: true, parts: [] },
  ];
}
