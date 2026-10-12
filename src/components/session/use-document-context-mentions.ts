import { i18n } from "@/i18n/runtime";
import { useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/notifications/toast";
import {
  addDocumentContextAttachment,
  buildDocumentMentionOptions,
  createDocumentContextAttachment,
  MAX_ATTACHED_DOCUMENTS,
  type DocumentMentionOption,
} from "@/lib/documents/attached-document-context";
import type { WorkspaceDocumentCatalogEntry } from "@/lib/documents/workspace-document-schemas";
import { useAppStore } from "@/store/app.store";
import { loadWorkspaceDocumentCatalog } from "@/store/workspace-documents-store";
import type { Attachment } from "@/types/chat";

const NO_ENTRIES: readonly WorkspaceDocumentCatalogEntry[] = [];

/**
 * The composer's side of attaching another workspace's document: the
 * documents `@` offers (newest first, deleted workspaces included) and the
 * attach action. The list reloads when the workspace changes and when the
 * window regains focus, since other workspaces change outside this view.
 */
export function useDocumentContextMentions(args: {
  taskId: string;
  attachments: readonly Attachment[];
  onAttachmentsChange: (attachments: Attachment[]) => void;
}) {
  const workspaceId = useAppStore(
    (state) => state.taskWorkspaceIdById[args.taskId] ?? state.activeWorkspaceId,
  );
  const [entries, setEntries] = useState(NO_ENTRIES);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void loadWorkspaceDocumentCatalog({ excludeWorkspaceId: workspaceId }).then(
        (next) => {
          if (!cancelled) {
            setEntries(next);
          }
        },
      );
    };
    load();
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
    };
  }, [workspaceId]);

  const options = useMemo(
    () => buildDocumentMentionOptions({ entries, attachments: args.attachments }),
    [args.attachments, entries],
  );

  const attach = (option: DocumentMentionOption) => {
    const next = addDocumentContextAttachment({
      attachments: args.attachments,
      attachment: createDocumentContextAttachment(option),
    });
    if (next === args.attachments) {
      toast.message(i18n.t("session:useDocumentContextMentions.limitReached"), {
        description: i18n.t("session:useDocumentContextMentions.limitDescription", {
          count: MAX_ATTACHED_DOCUMENTS,
        }),
      });
      return;
    }
    args.onAttachmentsChange([...next]);
  };
  return { options, attach };
}
