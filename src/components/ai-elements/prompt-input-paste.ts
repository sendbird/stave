import { i18n } from "@/i18n";
import {
  type ClipboardEvent as ReactClipboardEvent,
  useEffect,
  useMemo,
} from "react";
import { toast } from "@/components/ui";
import type { Attachment } from "@/types/chat";
import {
  collectClipboardFiles,
  createClipboardReadQueue,
  readClipboardImage,
  mergeClipboardImageAttachments,
  partitionClipboardFiles,
} from "./prompt-input.clipboard";
import type { PromptInputProps } from "./prompt-input.types";

/**
 * Owns the composer's clipboard read queue and its paste handler: pasted
 * images become image attachments once they are read, and other pasted files
 * go to `onPasteFiles`. The queue is recreated (and the old one cancelled)
 * when the attachment scope or workspace changes.
 */
export function usePromptInputClipboardPaste(args: {
  attachmentScopeId?: string;
  workspaceCwd?: string;
  onAttachmentsChange?: PromptInputProps["onAttachmentsChange"];
  onPasteFiles?: PromptInputProps["onPasteFiles"];
}) {
  const { onAttachmentsChange, onPasteFiles } = args;
  const clipboardReadQueue = useMemo(
    () => createClipboardReadQueue(),
    [args.attachmentScopeId, args.workspaceCwd],
  );
  useEffect(() => () => clipboardReadQueue.cancel(), [clipboardReadQueue]);

  function handlePaste(event: ReactClipboardEvent<HTMLDivElement>) {
    const clipboardData = event.clipboardData;
    if (!clipboardData) {
      return;
    }
    const { imageFiles, nonImageFiles: pastedFiles } =
      partitionClipboardFiles(
        collectClipboardFiles({
          items: clipboardData.items,
          files: clipboardData.files,
        }),
      );
    const shouldHandleImages =
      imageFiles.length > 0 && Boolean(onAttachmentsChange);
    const shouldHandleFiles =
      pastedFiles.length > 0 && Boolean(onPasteFiles);
    if (!shouldHandleImages && !shouldHandleFiles) {
      return;
    }
    event.preventDefault();
    if (shouldHandleFiles) {
      void onPasteFiles?.({ files: pastedFiles });
    }
    if (shouldHandleImages) {
      void clipboardReadQueue
        .enqueue(
          () =>
            Promise.all(
              imageFiles.map(async (file) => ({
                kind: "image" as const,
                id: crypto.randomUUID(),
                dataUrl: await readClipboardImage(file),
                label: file.name || i18n.t("composer:promptInput.label"),
                mimeType: file.type || "image/png",
              })),
            ),
          (newImages) =>
            onAttachmentsChange?.({
              attachments: (current) => [
                ...current.filter(
                  (attachment) => attachment.kind !== "image",
                ),
                ...mergeClipboardImageAttachments({
                  existing: current.filter(
                    (
                      attachment,
                    ): attachment is Extract<
                      Attachment,
                      { kind: "image" }
                    > => attachment.kind === "image",
                  ),
                  incoming: newImages,
                }),
              ],
            }),
        )
        .catch((error: unknown) => {
          toast.error(i18n.t("composer:promptInput.copy4"), {
            description:
              error instanceof Error
                ? error.message
                : String(error),
          });
        });
    }
  }

  return { clipboardReadQueue, handlePaste };
}
