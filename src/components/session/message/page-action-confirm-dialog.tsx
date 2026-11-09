import { useRef } from "react";
import * as stylex from "@stylexjs/stylex";
import { i18n, useTranslation } from "@/i18n";
import { Button } from "@/components/aui/components/Button";
import { Dialog } from "@/components/aui/components/Dialog";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";

export interface PageActionConfirmRequest {
  title: string;
  description: string;
  /** Shown verbatim: the message, or a tool's arguments. */
  content: string;
  contentLabel: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Arguments read better in a monospace face; a message does not. */
  monospace?: boolean;
}

/**
 * Asks the reader before an embedded page acts for them: an inline page or
 * an MCP App view sending a message as theirs, or a view running a tool
 * that is not marked read-only. The content is shown exactly as the page
 * wrote it. Cancel holds focus, so a keystroke meant for the page cannot
 * approve it; closing the dialog any other way declines.
 *
 * used by: `inline-render-message-confirm.tsx`, `mcp-app-view-confirm.tsx`.
 */
export function PageActionConfirmDialog(props: {
  request: PageActionConfirmRequest | null;
  onConfirm: () => void;
  onDecline: () => void;
}) {
  useTranslation();
  const { request } = props;
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  return (
    <Dialog.Root
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) props.onDecline();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup width="md" initialFocus={cancelRef} data-testid="page-action-confirm">
          <Dialog.Header>
            <Dialog.HeaderContent>
              <Dialog.Title>{request?.title ?? ""}</Dialog.Title>
              <Dialog.Description>{request?.description ?? ""}</Dialog.Description>
            </Dialog.HeaderContent>
            <Dialog.CloseButton aria-label={i18n.t("ui:dialog.close")} />
          </Dialog.Header>
          <Dialog.Body>
            <pre
              className={sx(styles.content, request?.monospace ? styles.monospace : styles.prose)}
              aria-label={request?.contentLabel}
            >
              {request?.content ?? ""}
            </pre>
          </Dialog.Body>
          <Dialog.Footer>
            <Button ref={cancelRef} size="sm" variant="quiet" onClick={props.onDecline}>
              {request?.cancelLabel ?? ""}
            </Button>
            <Button size="sm" variant="primary" onClick={props.onConfirm}>
              {request?.confirmLabel ?? ""}
            </Button>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const styles = stylex.create({
  content: {
    backgroundColor: vars["--aui-color-surface-tint"],
    borderColor: vars["--aui-color-border-subtle"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-text"],
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
    maxBlockSize: "16rem",
    overflow: "auto",
    overflowWrap: "anywhere",
    padding: vars["--aui-space-12"],
    whiteSpace: "pre-wrap",
  },
  prose: {
    fontFamily: vars["--aui-font-sans"],
    fontSize: vars["--aui-font-size-body"],
  },
  monospace: {
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
  },
});
