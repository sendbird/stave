import { i18n, useTranslation } from "@/i18n";
import { Check, Copy, Terminal } from "lucide-react";
import { useCallback, useMemo } from "react";

import { Button } from "@/components/aui/components/Button";
import { ClipboardCopyAnnouncement } from "@/components/system/ClipboardCopyAnnouncement";
import { useClipboardCopy } from "@/hooks/use-clipboard-copy";
import { CappedViewport } from "@/components/aui/components/CappedViewport";
import { agentSurface } from "@/components/aui/recipes/agent-surface";
import { controlIconSizes } from "@/components/aui/recipes/control-metrics";
import { sx } from "@/components/aui/utils/stylex";

import { tokenizeShellCommand } from "@/lib/shell-command-tokens";

import { commandResultStyles as styles, shellTokenStyles } from "./command-result.styles";

/** How long the copy action stays acknowledged before returning to rest. */
const COPIED_MS = 1600;

export function CommandResult(args: {
  /** The command line as the agent ran it. */
  command: string;
  /** Whether output is still arriving. */
  isStreaming?: boolean;
  /**
   * Whether the provider reported the call as failed. This is the *only*
   * failure signal available: `NormalizedProviderEvent.tool_result` carries
   * `output` and `isError`, and no exit code.
   */
  isError?: boolean;
  output?: string;
}) {
  useTranslation();
  const { command, isError = false, isStreaming = false, output } = args;
  const { status, copied, copy: copyText } = useClipboardCopy(COPIED_MS);
  const copy = useCallback(() => {
    void copyText(command);
  }, [command, copyText]);

  const trimmed = output?.trim() ?? "";

  return (
    <div className={sx(agentSurface.well, styles.root)}>
      <div className={sx(styles.header)}>
        <Terminal aria-hidden className={sx(styles.glyph)} size={controlIconSizes.sm} />
        <code className={sx(agentSurface.meta, styles.command)} title={command}>
          <ShellCommandText command={command} />
        </code>
        <Button
          iconOnly
          aria-label={
            copied
              ? i18n.t("session:commandResult.commandResult")
              : i18n.t("session:commandResult.commandResult2")
          }
          title={
            copied
              ? i18n.t("session:commandResult.commandResult")
              : i18n.t("session:commandResult.commandResult2")
          }
          onClick={copy}
          size="xs"
          type="button"
          variant="quiet"
          xstyle={styles.copy}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        </Button>
        <ClipboardCopyAnnouncement status={status} />
      </div>
      {trimmed.length > 0 ? (
        <CappedViewport
          label={i18n.t("session:commandResult.label", { value1: command })}
          live={isStreaming}
        >
          <pre className={sx(styles.output, isError && styles.outputError)}>{trimmed}</pre>
        </CappedViewport>
      ) : (
        <span className={sx(styles.empty)}>
          {isStreaming
            ? i18n.t("session:commandResult.commandResult3")
            : i18n.t("session:commandResult.commandResult4")}
        </span>
      )}
    </div>
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
