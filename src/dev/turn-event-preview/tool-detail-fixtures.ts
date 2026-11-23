import type { ToolUsePart } from "@/types/chat";

const path = "src/components/session/message/very-long-file-name-for-trace-detail.tsx";
export const toolDetailPreviewOutput = '{"records":[{"status":"ready","tags":["trace","preview"]}],"total":1}';

export const toolDetailPreviewParts: ToolUsePart[] = [
  {
    type: "tool_use",
    toolUseId: "preview-read-range",
    toolName: "Read",
    state: "output-available",
    input: JSON.stringify({ file_path: path, offset: 42, limit: 2 }),
    output: "42\texport const trace = true;\n43\treturn trace;",
  },
  {
    type: "tool_use",
    toolUseId: "preview-grep-locations",
    toolName: "Grep",
    state: "output-available",
    input: JSON.stringify({ pattern: "trace" }),
    output: `${path}:42:export const trace = true;\n${path}:43:return trace;`,
  },
  {
    type: "tool_use",
    toolUseId: "preview-json-detail",
    toolName: "records:lookup",
    state: "output-available",
    input: '{"query":"trace"}',
    output: toolDetailPreviewOutput,
  },
];
