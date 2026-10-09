import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import * as stylex from "@stylexjs/stylex";
import { i18n, useTranslation } from "@/i18n";
import { overlaySurface } from "@/components/ads/recipes/overlay-surface";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { cx, sx } from "@/components/ads/utils/stylex";
import { confirmDialogStyles } from "@/components/layout/confirm-dialog.styles";
import { Button } from "@/components/ui";
import { UI_LAYER_CLASS } from "@/lib/ui-layers";

export type McpAppConfirmRequest =
  | { kind: "message"; server: string; text: string }
  | { kind: "tool"; server: string; tool: string; arguments: Record<string, unknown> };

/**
 * Asks the reader before a view acts for them: queueing a message as theirs,
 * or running a tool that is not marked read-only. The request's content is
 * shown verbatim, and Cancel holds focus, so a keystroke meant for the view
 * cannot approve it.
 */
export function McpAppViewConfirm(props: {
  request: McpAppConfirmRequest | null;
  onResolve: (allowed: boolean) => void;
}) {
  useTranslation();
  const { request, onResolve } = props;
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (request) cancelRef.current?.focus();
  }, [request]);

  if (!request || typeof document === "undefined") return null;

  const title =
    request.kind === "message"
      ? i18n.t("session:mcpAppView.messageConfirm.title")
      : i18n.t("session:mcpAppView.toolConfirm.title", { tool: request.tool });
  const description =
    request.kind === "message"
      ? i18n.t("session:mcpAppView.messageConfirm.description", { server: request.server })
      : i18n.t("session:mcpAppView.toolConfirm.description", { server: request.server });
  const confirmLabel =
    request.kind === "message"
      ? i18n.t("session:mcpAppView.messageConfirm.confirm")
      : i18n.t("session:mcpAppView.toolConfirm.confirm");
  const content =
    request.kind === "message" ? request.text : JSON.stringify(request.arguments, null, 2);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onResolve(false);
    }
  };

  return createPortal(
    <div
      className={cx(UI_LAYER_CLASS.dialog, sx(confirmDialogStyles.backdrop))}
      onMouseDown={() => onResolve(false)}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={sx(overlaySurface.modal, overlaySurface.modalRounded, confirmDialogStyles.panel)}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <h3 id={titleId} className={sx(confirmDialogStyles.title)}>
          {title}
        </h3>
        <p id={descriptionId} className={sx(confirmDialogStyles.description)}>
          {description}
        </p>
        <pre className={sx(confirmDialogStyles.extra, styles.content)}>{content}</pre>
        <div className={sx(confirmDialogStyles.actions)}>
          <Button ref={cancelRef} type="button" variant="outline" onClick={() => onResolve(false)}>
            {i18n.t("shell:confirmDialog.cancel")}
          </Button>
          <Button type="button" onClick={() => onResolve(true)}>
            {confirmLabel}
          </Button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

const styles = stylex.create({
  content: {
    backgroundColor: vars["--ads-color-surface-tint"],
    borderRadius: vars["--ads-radius-control"],
    color: vars["--ads-color-text"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    marginBlockEnd: 0,
    maxBlockSize: "16rem",
    overflow: "auto",
    overflowWrap: "anywhere",
    padding: vars["--ads-space-8"],
    whiteSpace: "pre-wrap",
  },
});
