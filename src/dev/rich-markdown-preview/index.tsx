import { useLayoutEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { AssistantMessageBody } from "@/components/session/message/assistant-trace";
import { applyCustomTheme, applyThemeClass } from "@/lib/themes/apply";

const params = new URLSearchParams(window.location.search);
const ESC = "\u001b";

const LONG_TABLE_ROWS = Array.from({ length: 14 }, (_, index) => {
  const latency = [412, 38, 1204, 96, 7, 230, 18, 640, 75, 3, 1500, 55, 310, 120][index] ?? 0;
  const status = index % 4 === 0 ? "failed" : index % 3 === 0 ? "flaky" : "passed";
  return `| suite-${index + 1} | ${status} | ${latency.toLocaleString("en-US")} ms | ${(index * 7.25).toFixed(2)}% |`;
}).join("\n");

/** One reply with every block this preview checks. */
export const RICH_MARKDOWN_REPLY = `## Test run summary

A short table sorts by any column:

| Package | Tests | Coverage | Duration |
| --- | ---: | ---: | --- |
| core | 412 | 91.5% | 12 s |
| renderer | 1,204 | 78.2% | 48 s |
| electron | 96 | 64.0% | 9 s |
| cli | 38 | — | 3 s |

A long table also gets a filter:

| Suite | Status | p95 latency | Share |
| --- | --- | ---: | ---: |
${LONG_TABLE_ROWS}

A table with links stays as written:

| Doc | Link |
| --- | --- |
| Guide | [open](https://example.com/guide) |
| API | \`src/api.ts\` |

Math: the price is $5 and $10 is the cap, while $e^{i\\pi} + 1 = 0$ is inline.

$$
\\int_0^1 x^2\\,dx = \\frac{1}{3}
$$

\`\`\`math
\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}
\`\`\`

\`\`\`json
{
  "name": "stave",
  "version": "0.42.0",
  "big": 12345678901234567890,
  "flags": { "beta": true, "telemetry": null },
  "tags": ["chat", "markdown", "terminal"]
}
\`\`\`

\`\`\`ansi
$ bun test
${ESC}[32m✓${ESC}[0m tests/table-sort.test.ts ${ESC}[2m(9)${ESC}[0m
${ESC}[31m✗${ESC}[0m tests/math.test.ts ${ESC}[1;31mFAIL${ESC}[0m
${ESC}[33mwarn${ESC}[0m deprecated option ${ESC}[36m--legacy${ESC}[0m
${ESC}[35mmagenta${ESC}[0m ${ESC}[34mblue${ESC}[0m ${ESC}[90mgray${ESC}[0m ${ESC}[41;97m BG ${ESC}[0m ${ESC}[38;5;208m256-orange${ESC}[0m
\`\`\`

\`\`\`console
$ ls -la
total 8
\`\`\`
`;

/**
 * The transcript renderer on one finished reply with tables, math, JSON and
 * terminal output. `theme=dark` switches theme.
 */
export function RichMarkdownPreview() {
  const [dark] = useState(() => params.get("theme") === "dark");
  useLayoutEffect(() => {
    applyCustomTheme({ theme: null });
    applyThemeClass({ enabled: dark });
  }, [dark]);
  return (
    <div className={sx(styles.page)}>
      <div className={sx(styles.column)} data-preview-reply="">
        <AssistantMessageBody
          taskId="rich-markdown-preview"
          messageId="reply"
          streamingEnabled
          traceExpansionMode="manual"
          showInterimMessages
          message={{
            role: "assistant",
            content: RICH_MARKDOWN_REPLY,
            parts: [{ type: "text", text: RICH_MARKDOWN_REPLY }],
            isStreaming: false,
          }}
        />
      </div>
    </div>
  );
}

const styles = stylex.create({
  page: {
    backgroundColor: vars["--aui-color-canvas"],
    color: vars["--aui-color-text"],
    minHeight: "100vh",
    padding: vars["--aui-space-24"],
  },
  column: { maxWidth: "48rem", marginInline: "auto", minWidth: 0 },
});
