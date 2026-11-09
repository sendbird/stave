import { useEffect, useRef } from "react";
import * as stylex from "@stylexjs/stylex";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/aui/components/Button";
import { TextField } from "@/components/aui/components/TextField";
import { Tooltip } from "@/components/aui/components/Tooltip";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { elevations, localStack } from "@/lib/ui-layers.stylex";

/**
 * A find widget that floats over the top-end corner of the surface it searches
 * (the transcript or a terminal).
 * It never takes layout space, so opening it does not push the content down
 * or resize a terminal. The host must be `position: relative`.
 *
 * Enter / Shift+Enter step to the next / previous match; Escape closes it and
 * hands focus back to whatever had it before the widget opened, unless the
 * host's `onClose` already moved focus somewhere on purpose.
 */
export function TranscriptFind(props: {
  query: string;
  onQuery: (value: string) => void;
  onStep: (backward: boolean) => void;
  /**
   * `restoresFocus` is false when the element focused before opening is gone
   * (the trigger that unmounted to make room); the host then picks a target.
   */
  onClose: (restoresFocus: boolean) => void;
  /** Match position or "No matches"; empty while there is nothing to report. */
  result: string;
  label: string;
  /** False disables Previous / Next (no query or no matches). */
  canStep?: boolean;
  /** Bump to re-focus and select the field while the widget is already open. */
  focusRequest?: number;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const active = document.activeElement;
    returnFocus.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }, []);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [props.focusRequest]);

  const close = () => {
    const previous = returnFocus.current;
    props.onClose(Boolean(previous?.isConnected));
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (previous?.isConnected && (!active || active === document.body)) {
        previous.focus({ preventScroll: true });
      }
    });
  };
  const canStep = props.canStep ?? true;

  return (
    <div
      role="search"
      aria-label={props.label}
      data-transcript-find=""
      className={sx(styles.widget, elevations.floating)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
        if (event.key === "Enter" && event.target === input.current) {
          event.preventDefault();
          if (canStep) props.onStep(event.shiftKey);
        }
      }}
    >
      <Search aria-hidden {...stylex.props(styles.icon)} />
      <TextField
        controlOnly
        size="xs"
        ref={input}
        value={props.query}
        aria-label={props.label}
        placeholder={props.label}
        spellCheck={false}
        autoComplete="off"
        xstyle={styles.field}
        onChange={(event) => props.onQuery(event.target.value)}
      />
      <span role="status" aria-live="polite" className={sx(styles.result)}>
        {props.result}
      </span>
      <Tooltip content={t("transcriptFind.previous")} side="bottom">
        <Button
          type="button"
          size="xs"
          variant="quiet"
          iconOnly
          xstyle={styles.action}
          disabled={!canStep}
          aria-label={t("transcriptFind.previous")}
          onClick={() => props.onStep(true)}
        >
          <ChevronUp aria-hidden />
        </Button>
      </Tooltip>
      <Tooltip content={t("transcriptFind.next")} side="bottom">
        <Button
          type="button"
          size="xs"
          variant="quiet"
          iconOnly
          xstyle={styles.action}
          disabled={!canStep}
          aria-label={t("transcriptFind.next")}
          onClick={() => props.onStep(false)}
        >
          <ChevronDown aria-hidden />
        </Button>
      </Tooltip>
      <Tooltip content={t("transcriptFind.close")} side="bottom">
        <Button
          type="button"
          size="xs"
          variant="quiet"
          iconOnly
          xstyle={styles.action}
          aria-label={t("transcriptFind.close")}
          onClick={close}
        >
          <X aria-hidden />
        </Button>
      </Tooltip>
    </div>
  );
}

const styles = stylex.create({
  widget: {
    position: "absolute",
    top: vars["--aui-space-8"],
    insetInlineEnd: vars["--aui-space-12"],
    zIndex: localStack["--stave-stack-floating"],
    display: "flex",
    alignItems: "center",
    gap: vars["--aui-space-2"],
    maxWidth: `calc(100% - 2 * ${vars["--aui-space-12"]})`,
    paddingBlock: vars["--aui-space-4"],
    paddingInlineStart: vars["--aui-space-8"],
    paddingInlineEnd: vars["--aui-space-4"],
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-panel"],
    backgroundColor: vars["--aui-color-surface-raised"],
    color: vars["--aui-color-text"],
  },
  icon: {
    flexShrink: 0,
    width: vars["--aui-control-icon-size-sm"],
    height: vars["--aui-control-icon-size-sm"],
    color: vars["--aui-color-text-muted"],
  },
  action: { flexShrink: 0 },
  field: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    width: "14rem",
  },
  result: {
    flexShrink: 0,
    minWidth: "4.5rem",
    paddingInline: vars["--aui-space-4"],
    textAlign: "end",
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
});
