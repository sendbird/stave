import { i18n, useTranslation } from "@/i18n";
import { Check, Copy, Terminal } from "lucide-react";
import { useMemo } from "react";

import { Button } from "@/components/aui/components/Button";
import { ClipboardCopyAnnouncement } from "@/components/system/ClipboardCopyAnnouncement";
import { useClipboardCopy } from "@/hooks/use-clipboard-copy";
import { CappedViewport } from "@/components/aui/components/CappedViewport";
import { agentSurface } from "@/components/aui/recipes/agent-surface";
import { controlIconSizes } from "@/components/aui/recipes/control-metrics";
import { sx } from "@/components/aui/utils/stylex";

import { normalizeToolDetailOutput, type ToolDetailInput } from "@/lib/tool-detail";
import { tokenizeShellCommand } from "@/lib/shell-command-tokens";
import { stripAnsiControlSequences } from "@/lib/workspace-scripts/ansi";

import { ToolJsonTree, ToolMatchList } from "./tool-detail";
import { commandResultStyles as styles, shellTokenStyles } from "./command-result.styles";

/** How long the copy action stays acknowledged before returning to rest. */
const COPIED_MS = 1600;

export function CommandResult(args: {
  /** The command line as the agent ran it. */
  command: string;
  /** Whether output is still arriving. */
  isStreaming?: boolean;
  /** Whether the provider reported a tool failure. */
  isError?: boolean;
  /** Process exit code, when the provider reported it. */
  exitCode?: number | null;
  output?: string;
  search?: ToolDetailInput["search"];
  taskId?: string;
}) {
  useTranslation();
  const { command, exitCode, isError = false, isStreaming = false, output, search, taskId } = args;
  const cleanOutput = useMemo(() => stripAnsiControlSequences(output ?? ""), [output]);
  const trimmed = cleanOutput.trim();
  const detail = useMemo(() => !isStreaming && !isError
    ? normalizeToolDetailOutput(cleanOutput, search)
    : undefined, [cleanOutput, isError, isStreaming, search]);

  return (
    <div className={sx(agentSurface.well, styles.root)}>
      <div className={sx(styles.header)}>
        <Terminal aria-hidden className={sx(styles.glyph)} size={controlIconSizes.sm} />
        <code className={sx(agentSurface.meta, styles.command)} title={command}>
          <ShellCommandText command={command} />
        </code>
        <CommandCopyButton iconOnly labelKey="session:commandResult.copyCommand" text={command} />
        {!isStreaming ? (
          <span className={sx(styles.exit, exitCode != null && exitCode !== 0 && styles.outputError)}>
            {exitCode == null
              ? i18n.t("session:commandResult.exitUnknown")
              : i18n.t("session:commandResult.exitCode", { code: exitCode })}
          </span>
        ) : null}
        {trimmed ? (
          <CommandCopyButton labelKey={detail?.kind === "json" ? "session:toolDetail.copyRaw" : "session:commandResult.copyOutput"} text={cleanOutput} />
        ) : null}
      </div>
      {trimmed.length > 0 ? (
        <CappedViewport
          label={i18n.t("session:commandResult.label", { value1: command })}
          live={isStreaming}
        >
          {detail?.kind === "matches" && taskId ? (
            <div className={sx(styles.output)}><ToolMatchList detail={detail} taskId={taskId} /></div>
          ) : detail?.kind === "json" ? (
            <div className={sx(styles.output)}><ToolJsonTree root={detail.root} /></div>
          ) : (
            <pre className={sx(styles.output, isError && styles.outputError)}>
              {detail?.kind === "text" && detail.truncated ? detail.text : trimmed}
            </pre>
          )}
        </CappedViewport>
      ) : (
        <span className={sx(styles.empty)}>
          {isStreaming
            ? i18n.t("session:commandResult.commandResult3")
            : i18n.t("session:commandResult.commandResult4")}
        </span>
      )}
      {detail?.kind === "matches" && detail.hidden > 0 ? (
        <span className={sx(styles.empty)}>{i18n.t("session:toolDetail.hiddenMatches", { count: detail.hidden })}</span>
      ) : null}
      {detail?.kind === "text" && detail.truncated ? (
        <span className={sx(styles.empty)}>{i18n.t("session:toolDetail.outputPreview")}</span>
      ) : null}
    </div>
  );
}

function CommandCopyButton(args: { iconOnly?: true; labelKey: "session:commandResult.copyCommand" | "session:commandResult.copyOutput" | "session:toolDetail.copyRaw"; text: string }) {
  useTranslation();
  const { status, copied, copy } = useClipboardCopy(COPIED_MS);
  const label = i18n.t(copied ? "session:commandResult.commandResult" : args.labelKey);
  return (
    <>
      <Button
        aria-label={label}
        iconOnly={args.iconOnly}
        onClick={() => void copy(args.text)}
        size="xs"
        title={label}
        type="button"
        variant="quiet"
        xstyle={styles.copy}
      >
        {args.iconOnly ? (copied ? <Check aria-hidden /> : <Copy aria-hidden />) : label}
      </Button>
      <ClipboardCopyAnnouncement status={status} />
    </>
  );
}

/** The command line with its program, flags, quoting and risky parts told apart. */
function ShellCommandText(props: { command: string }) {
  const tokens = useMemo(() => tokenizeShellCommand(props.command), [props.command]);
  return (
    <>
      {tokens.map((token, index) => (
        <span
          key={index}
          className={token.kind === "text" ? undefined : sx(shellTokenStyles[token.kind])}
        >
          {token.text}
        </span>
      ))}
    </>
  );
}
