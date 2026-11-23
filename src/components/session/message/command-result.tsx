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

import { tokenizeShellCommand } from "@/lib/shell-command-tokens";

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
}) {
  useTranslation();
  const { command, exitCode, isError = false, isStreaming = false, output } = args;
  const trimmed = output?.trim() ?? "";

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
        {output && trimmed ? (
          <CommandCopyButton labelKey="session:commandResult.copyOutput" text={output} />
        ) : null}
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

function CommandCopyButton(args: { iconOnly?: true; labelKey: "session:commandResult.copyCommand" | "session:commandResult.copyOutput"; text: string }) {
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
