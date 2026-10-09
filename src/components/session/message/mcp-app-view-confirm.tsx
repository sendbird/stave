import { i18n, useTranslation } from "@/i18n";
import { PageActionConfirmDialog, type PageActionConfirmRequest } from "./page-action-confirm-dialog";

export type McpAppConfirmRequest =
  | { kind: "message"; server: string; text: string }
  | { kind: "tool"; server: string; tool: string; arguments: Record<string, unknown> };

function describeRequest(request: McpAppConfirmRequest): PageActionConfirmRequest {
  const cancelLabel = i18n.t("shell:confirmDialog.cancel");
  if (request.kind === "message") {
    return {
      title: i18n.t("session:mcpAppView.messageConfirm.title"),
      description: i18n.t("session:mcpAppView.messageConfirm.description", { server: request.server }),
      content: request.text,
      contentLabel: i18n.t("session:mcpAppView.messageConfirm.contentLabel"),
      confirmLabel: i18n.t("session:mcpAppView.messageConfirm.confirm"),
      cancelLabel,
    };
  }
  return {
    title: i18n.t("session:mcpAppView.toolConfirm.title", { tool: request.tool }),
    description: i18n.t("session:mcpAppView.toolConfirm.description", { server: request.server }),
    content: JSON.stringify(request.arguments, null, 2),
    contentLabel: i18n.t("session:mcpAppView.toolConfirm.contentLabel"),
    confirmLabel: i18n.t("session:mcpAppView.toolConfirm.confirm"),
    cancelLabel,
    monospace: true,
  };
}

/**
 * Asks the reader before a view acts for them: queueing a message as theirs,
 * or running a tool that is not marked read-only.
 */
export function McpAppViewConfirm(props: {
  request: McpAppConfirmRequest | null;
  onResolve: (allowed: boolean) => void;
}) {
  useTranslation();
  const { request, onResolve } = props;
  return (
    <PageActionConfirmDialog
      request={request ? describeRequest(request) : null}
      onConfirm={() => onResolve(true)}
      onDecline={() => onResolve(false)}
    />
  );
}
