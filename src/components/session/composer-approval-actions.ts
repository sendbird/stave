import {
  addTrustedToolEntry,
  buildTrustedToolEntryForApproval,
} from "@/lib/providers/trusted-tools";
import { useAppStore } from "@/store/app.store";

/**
 * Stave's own "always allow" for a runtime that cannot persist the grant:
 * remember the exact tool input in the trusted-tools setting, then allow the
 * request it came from.
 */
export function trustToolAndApprove(args: {
  taskId: string;
  messageId: string;
  requestId: string;
  toolName: string;
  input?: string;
}) {
  const state = useAppStore.getState();
  const entry = buildTrustedToolEntryForApproval({
    toolName: args.toolName,
    input: args.input,
  });
  if (entry) {
    state.updateSettings({
      patch: {
        trustedTools: addTrustedToolEntry({
          entries: state.settings.trustedTools,
          entry,
        }),
      },
    });
  }
  state.resolveApproval({
    taskId: args.taskId,
    messageId: args.messageId,
    requestId: args.requestId,
    approved: true,
  });
}
