import type {
  MessagePart,
  ToolUsePart,
  ApprovalPart,
  UserInputPart,
} from "@/types/chat";
import { createCompletedPreviewMessage } from "../agent-preview/fixtures";
import { buildInlineRenderToolResult } from "@/lib/inline-render/inline-render";
import { mcpAppViewPart } from "./mcp-app-fixture";

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
/** A page styled only with the host theme variables, as the tool asks. */
const INLINE_RENDER_PAGE = `<!doctype html>
<style>
  body { padding: 16px; }
  h2 { font-size: 14px; margin: 0 0 12px; }
  .bars { display: grid; gap: 8px; }
  .row { display: grid; grid-template-columns: 72px 1fr 48px; align-items: center; gap: 8px; font-size: 13px; }
  .track { background: var(--muted); border-radius: var(--radius); block-size: 12px; overflow: hidden; }
  .fill { background: var(--chart-1); block-size: 100%; }
  .row:nth-child(2) .fill { background: var(--chart-2); }
  .row:nth-child(3) .fill { background: var(--chart-3); }
  .muted { color: var(--muted-foreground); }
  table { border-collapse: collapse; inline-size: 100%; margin-block-start: 16px; font-size: 13px; }
  th, td { border-block-end: 1px solid var(--border); padding: 6px 4px; text-align: start; }
  button { margin-block-start: 12px; font: inherit; color: var(--primary-foreground); background: var(--primary); border: 0; border-radius: var(--radius); padding: 6px 10px; }
</style>
<h2>주간 토큰 사용량</h2>
<div class="bars">
  <div class="row"><span>Claude</span><div class="track"><div class="fill" style="inline-size: 72%"></div></div><span class="muted">72%</span></div>
  <div class="row"><span>Codex</span><div class="track"><div class="fill" style="inline-size: 41%"></div></div><span class="muted">41%</span></div>
  <div class="row"><span>Cursor</span><div class="track"><div class="fill" style="inline-size: 18%"></div></div><span class="muted">18%</span></div>
</div>
<table><thead><tr><th>Provider</th><th>Turns</th><th>Docs</th></tr></thead>
<tbody><tr><td>Claude</td><td>128</td><td><a href="https://example.com/claude">link</a></td></tr>
<tr><td>Codex</td><td>74</td><td><a href="https://example.com/codex">link</a></td></tr></tbody></table>
<button type="button" onclick="this.textContent = 'Clicked ' + (++window.clicks || (window.clicks = 1))">Click me</button>
<button type="button" id="ask" onclick="window.stave.sendMessage('Claude 사용량이 왜 높은지 설명해 줘').then(function (r) { document.getElementById('reply').textContent = 'reply: ' + r.status; }, function (e) { document.getElementById('reply').textContent = 'reply: ' + e.code + ' ' + e.message; })">Ask about Claude</button>
<button type="button" id="select" onclick="window.stave.updateModelContext({ selectedProvider: 'Codex', share: 0.41 }).then(function () { document.getElementById('reply').textContent = 'context: stored'; })">Select Codex</button>
<p class="muted" id="reply">reply: none</p>
<p class="muted" id="network">network: checking…</p>
<script>
  // Without a click, the host must refuse.
  window.stave.sendMessage("unprompted").then(
    function () { document.getElementById("reply").dataset.unprompted = "sent"; },
    function (error) { document.getElementById("reply").dataset.unprompted = String(error.code); }
  );
  fetch("https://example.com/", { mode: "no-cors" }).then(
    function () { document.getElementById("network").textContent = "network: allowed"; },
    function () { document.getElementById("network").textContent = "network: blocked"; }
  );
</script>`;

const inlineRender = (): ToolUsePart => ({
  type: "tool_use",
  toolUseId: "preview-inline-render",
  toolName: "mcp__stave-local-mcp__stave_render_html",
  input: JSON.stringify({ title: "주간 토큰 사용량", html: INLINE_RENDER_PAGE }),
  output: JSON.stringify(
    buildInlineRenderToolResult({
      renderId: "0123456789abcdef-0f0e0d0c-0b0a-4908-8706-050403020100",
      title: "주간 토큰 사용량",
      height: 320,
    }),
    null,
    2,
  ),
  state: "output-available",
});

/** A 240×120 checkerboard, as an MCP image block a tool returned. */
const PREVIEW_TOOL_IMAGE = "iVBORw0KGgoAAAANSUhEUgAAAPAAAAB4CAIAAABD1OhwAAAB00lEQVR42u3cMQ0AIBAEQRwhCNmooEIBCQK+5CoyCQImf1vT+piRt/aJPB6el9cciEfQBuMRtMF4BM3DI2geQTsQj6ANxiNog/EImodH0DyCdiAeQRuMR9AG4xE0D4+geQTtQDyCNhiPoA3GI2geHkHzCNqBeARtMB5BG4wnFLRD8/zkETSPoA3GI2iD8Qiah0fQPIJ2IB5BG4xH0AbjETQPj6B5BO1APII2GI+gDcYjaB4eQfMI2oF4BG0wHkEbjEfQPDyC5hG0A/EI2mA8gjYYTypoh+bxc5LBeARtMB5B8/AImkfQDsQjaIPxCNpgPILm4RE0j6AdiEfQBuMRtMF4BM3DI2geQTsQj6ANxiNog/EImodH0DyCdiAeQRuMR9AG4xE0D08N2qF5/JxkMB5BG4xH0Dw8guYRtAPxCNpgPII2GI+geXgEzSNoB+IRtMF4BG0wHkHz8AiaR9AOxCNog/EI2mA8gubhETSPoB2IR9AG4xG0wXgEzcNTg3ZoHj8nGYxH0AbjETQPj6B5BO1APII2GI+gDcYjaB4eQfMI2oF4BG0wHkEbjEfQPDyC5hG0A/EI2mA8gjYYj6B5eATNI2gH4hG0wXgEbTAeQfPwlHcBl8EKVQ6msngAAAAASUVORK5CYII=";

const dangerousCommand = (): ToolUsePart => ({
  type: "tool_use",
  toolUseId: "preview-dangerous-command",
  toolName: "Bash",
  input: JSON.stringify({
    command: "cd packages/app && rm -rf dist node_modules/.cache && FOO=1 bun install && git push --force origin HEAD # retry",
  }),
  state: "output-available",
  elapsedSeconds: 4,
  output: "Everything up-to-date",
});

const imageTool = (): ToolUsePart => ({
  type: "tool_use",
  toolUseId: "preview-image-tool",
  toolName: "mcp__figma__get_screenshot",
  input: JSON.stringify({ nodeId: "12:34" }),
  state: "output-available",
  output: JSON.stringify({
    content: [
      { type: "text", text: "Frame 12:34" },
      { type: "image", data: PREVIEW_TOOL_IMAGE, mimeType: "image/png" },
    ],
  }),
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
    {
      title: "인라인 HTML 렌더",
      parts: [
        inlineRender(),
        { type: "text", text: "위 차트는 이번 주 프로바이더별 사용량입니다." },
      ],
    },
    {
      title: "MCP 앱 뷰",
      parts: [mcpAppViewPart(), { type: "text", text: "서울 날씨 뷰를 위에 표시했습니다." }],
    },
    { title: "셸 명령 강조 · 위험 플래그", parts: [dangerousCommand(), { type: "text", text: "푸시했습니다." }] },
    {
      title: "Mermaid 다이어그램",
      parts: [
        {
          type: "text",
          text: "요청 흐름은 다음과 같습니다.\n\n```mermaid\nflowchart LR\n  Composer[Composer] --> IPC[IPC]\n  IPC --> Runtime[Provider runtime]\n  Runtime -->|events| Store[(Store)]\n  Store --> Composer\n```\n\n각 단계는 비동기입니다.",
        },
      ],
    },
    { title: "도구 결과 이미지", parts: [imageTool(), { type: "text", text: "프레임을 확인했습니다." }] },
  ];
}
