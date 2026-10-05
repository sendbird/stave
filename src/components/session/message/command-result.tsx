import { i18n, useTranslation } from "@/i18n";
import { Terminal } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ads/components/Button";
import { CappedViewport } from "@/components/ads/components/CappedViewport";
import { agentSurface } from "@/components/ads/recipes/agent-surface";
import { controlIconSizes } from "@/components/ads/recipes/control-metrics";
import { sx } from "@/components/ads/utils/stylex";

import { commandResultStyles as styles } from "./command-result.styles";

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
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const copy = useCallback(() => {
    void navigator.clipboard?.writeText(command).then(() => {
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), COPIED_MS);
    });
  }, [command]);

  const trimmed = output?.trim() ?? "";

  return (
    <div className={sx(agentSurface.well, styles.root)}>
      <div className={sx(styles.header)}>
        <Terminal aria-hidden className={sx(styles.glyph)} size={controlIconSizes.sm} />
        <code className={sx(agentSurface.meta, styles.command)} title={command}>
          {command}
        </code>
        <Button
          onClick={copy}
          size="xs"
          type="button"
          variant="quiet"
          xstyle={styles.copy}
        >
          {copied ? i18n.t("session:commandResult.commandResult") : i18n.t("session:commandResult.commandResult2")}
        </Button>
      </div>
      {trimmed.length > 0 ? (
        <CappedViewport label={i18n.t("session:commandResult.label", { value1: command })} live={isStreaming}>
          <pre
            className={sx(styles.output, isError && styles.outputError)}
          >
            {trimmed}
          </pre>
        </CappedViewport>
      ) : (
        <span className={sx(styles.empty)}>
          {isStreaming ? i18n.t("session:commandResult.commandResult3") : i18n.t("session:commandResult.commandResult4")}
        </span>
      )}
    </div>
  );
}
