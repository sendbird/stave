import { useMemo } from "react";
import * as stylex from "@stylexjs/stylex";
import { useTranslation } from "@/i18n";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { TurnTraceLegend, TurnTraceTimeline } from "@/components/session/TurnTraceTimeline";
import { buildTurnTrace, type TurnTraceMessage } from "@/components/session/turn-trace.utils";
import type { ToolUsePart } from "@/types/chat";

const styles = stylex.create({
  section: {
    display: "grid",
    gap: vars["--aui-space-8"],
    // The Task panel's width, where the timeline lives.
    inlineSize: "560px",
    maxInlineSize: "100%",
    padding: vars["--aui-space-16"],
    borderRadius: vars["--aui-radius-panel"],
    backgroundColor: vars["--aui-color-surface-raised"],
  },
  title: {
    margin: 0,
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
});

const T0 = Date.UTC(2026, 10, 3, 9, 0, 0);
const at = (seconds: number) => new Date(T0 + seconds * 1_000).toISOString();

function tool(overrides: Partial<ToolUsePart> & { toolUseId: string }): ToolUsePart {
  return {
    type: "tool_use",
    toolName: "Read",
    input: JSON.stringify({ file_path: "server/users.ts" }),
    state: "output-available",
    ...overrides,
  };
}

/** A running turn: two reads, an edit, a subagent with a read inside it, a running command, and one call saved without times. */
const MESSAGES: TurnTraceMessage[] = [
  {
    role: "assistant",
    providerId: "claude-code",
    usage: { inputTokens: 1_200, outputTokens: 800, cacheReadTokens: 16_000, totalCostUsd: 0.21 },
    parts: [
      tool({ toolUseId: "read-1", startedAt: at(5), completedAt: at(6) }),
      tool({
        toolUseId: "edit-1",
        toolName: "Edit",
        input: JSON.stringify({ file_path: "server/users.ts", old_string: "a", new_string: "b" }),
        startedAt: at(35),
        completedAt: at(36),
      }),
      tool({
        toolUseId: "agent-1",
        toolName: "Agent",
        input: JSON.stringify({ description: "Explore the users router", subagent_type: "Explore" }),
        startedAt: at(54),
        completedAt: at(95),
      }),
      tool({ toolUseId: "read-2", parentToolUseId: "agent-1", startedAt: at(60), completedAt: at(61) }),
      tool({
        toolUseId: "cmd-1",
        toolName: "Bash",
        input: JSON.stringify({ command: "bun test tests/users.test.ts" }),
        state: "input-available",
        startedAt: at(83),
      }),
      tool({ toolUseId: "saved-1", toolName: "Grep", input: JSON.stringify({ pattern: "paginate" }) }),
    ],
  },
];

export function TurnTraceRegressionFixture() {
  const { i18n } = useTranslation();
  const trace = useMemo(
    () =>
      buildTurnTrace({
        messages: MESSAGES,
        turnStartedAt: T0,
        turnCompletedAt: null,
        live: true,
        now: T0 + 95_000,
      }),
    // Span names follow the language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [i18n.language],
  );
  return (
    <section className={stylex.props(styles.section).className} data-testid="turn-trace-fixture">
      <h2 className={stylex.props(styles.title).className}>Turn timeline geometry</h2>
      <TurnTraceLegend live />
      <TurnTraceTimeline trace={trace} />
    </section>
  );
}
