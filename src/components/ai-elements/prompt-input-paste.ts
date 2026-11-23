import { i18n } from "@/i18n";
import { type ClipboardEvent, type RefObject, useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import { toast } from "@/components/ui";
import { shouldAttachPastedText } from "@/lib/fs/pasted-text";
import { isPastedTextAttachment, type Attachment, type PastedTextAttachment } from "@/types/chat";
import {
  collectClipboardFiles,
  createClipboardReadQueue,
  mergeClipboardImageAttachments,
  partitionClipboardFiles,
  readClipboardImage,
} from "./prompt-input.clipboard";
import type { PromptLexicalEditorHandle } from "./prompt-lexical-editor";
import type { PromptInputProps } from "./prompt-input.types";

type ImageAttachment = Extract<Attachment, { kind: "image" }>;

export function usePromptInputClipboardPaste(args: {
  attachmentScopeId?: string;
  workspaceCwd?: string;
  onAttachmentsChange?: PromptInputProps["onAttachmentsChange"];
  onPasteFiles?: PromptInputProps["onPasteFiles"];
  pastedTextFiles?: PromptInputProps["pastedTextFiles"];
  valueRef: RefObject<string>;
  editorRef: RefObject<PromptLexicalEditorHandle | null>;
  onValueChange: (text: string) => void;
  restoreSelection: (position: number) => void;
}) {
  const { onAttachmentsChange, onPasteFiles, pastedTextFiles } = args;
  // A different draft owns different queued reads and recovery callbacks.
  const { queue, recoveries } = useMemo(() => ({
    queue: createClipboardReadQueue(),
    recoveries: new Set<() => void>(),
  }), [args.attachmentScopeId, args.workspaceCwd]);
  useLayoutEffect(() => () => {
    queue.cancel();
    for (const recover of recoveries) recover();
    recoveries.clear();
  }, [queue, recoveries]);
  const pending = useSyncExternalStore(queue.subscribe, queue.isPending, queue.isPending);

  function captureInlineInsertion() {
    const original = args.valueRef.current;
    const selection = args.editorRef.current?.getSelectionRange();
    return (text: string) => {
      const current = args.valueRef.current;
      const unchanged = current === original;
      const start = unchanged && selection ? selection.start : current.length;
      const end = unchanged && selection ? selection.end : start;
      const insertion = !unchanged && current ? "\n" + text : text;
      const next = current.slice(0, start) + insertion + current.slice(end);
      args.valueRef.current = next;
      args.onValueChange(next);
      args.restoreSelection(start + insertion.length);
    };
  }

  function blockWhileReading() {
    if (!queue.isPending()) return false;
    toast.info(i18n.t("composer:promptInput.submitCurrentMessage"));
    return true;
  }

  function attachTransfer(
    transfer: Pick<DataTransfer, "items" | "files">,
    pastedText?: string,
    imageIndex = 0,
  ): boolean {
    const { imageFiles, nonImageFiles } = partitionClipboardFiles(collectClipboardFiles(transfer));
    const images = onAttachmentsChange ? imageFiles : [];
    const files = onAttachmentsChange ? nonImageFiles : [...nonImageFiles, ...imageFiles];
    const hasFiles = Boolean(onPasteFiles && files.length > 0);
    if (!hasFiles && images.length === 0 && pastedText === undefined) return false;

    const insertInline = captureInlineInsertion();
    const recover = pastedTextFiles && pastedText !== undefined
      ? () => pastedTextFiles.recover(pastedText)
      : undefined;
    if (recover) recoveries.add(recover);

    void queue.enqueue(async () => {
      const [newImages, savedText] = await Promise.all([
        Promise.all(images.map(async (file): Promise<ImageAttachment | null> => {
          try {
            return {
              kind: "image",
              id: crypto.randomUUID(),
              dataUrl: await readClipboardImage(file),
              label: file.name || i18n.t("composer:promptInput.label"),
              mimeType: file.type || "image/png",
            };
          } catch (error) {
            toast.error(i18n.t("composer:promptInput.copy4"), {
              description: error instanceof Error ? error.message : String(error),
            });
            return null;
          }
        })),
        pastedText !== undefined && pastedTextFiles
          ? pastedTextFiles.save(pastedText).catch(() => null)
          : null,
        hasFiles ? onPasteFiles?.({ files }) : undefined,
      ]);
      const ordered: Attachment[] = [...newImages.slice(0, imageIndex).filter((image) => image !== null)];
      if (savedText) ordered.push(savedText);
      ordered.push(...newImages.slice(imageIndex).filter((image) => image !== null));
      return ordered;
    }, (ordered) => {
      if (pastedText !== undefined && !ordered.some(isPastedTextAttachment)) {
        if (recover) recoveries.delete(recover);
        insertInline(pastedText);
        toast.warning(i18n.t("composer:pastedText.saveFailed"));
      }
      if (ordered.length) onAttachmentsChange?.({
        attachments: (current) => {
          const existingImages = current.filter((item) => item.kind === "image");
          const incomingImages = ordered.filter((item) => item.kind === "image");
          const includedImages = new Set(mergeClipboardImageAttachments({
            existing: existingImages,
            incoming: incomingImages,
          }));
          return [...current, ...ordered.filter((item) => item.kind !== "image" || includedImages.has(item))];
        },
      });
      if (recover) recoveries.delete(recover);
    }).catch(() => {
      if (recover && recoveries.delete(recover)) {
        insertInline(pastedText ?? "");
        toast.warning(i18n.t("composer:pastedText.saveFailed"));
      } else {
        toast.error(i18n.t("composer:promptInput.copy4"));
      }
    });
    return true;
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const transfer = event.clipboardData;
    if (!transfer) return;
    const text = transfer.getData("text/plain");
    const shouldSave = Boolean(pastedTextFiles && onAttachmentsChange && shouldAttachPastedText(text));
    const items = Array.from(transfer.items);
    const textIndex = items.findIndex((item) => item.kind === "string" && item.type === "text/plain");
    const imageIndex = textIndex < 0 ? 0 : items.slice(0, textIndex)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/") && item.getAsFile()).length;

    if (attachTransfer(transfer, shouldSave ? text : undefined, imageIndex)) {
      event.preventDefault();
      event.stopPropagation();
      // Preserve inline text on image pastes even when it doesn't need a file.
      if (!shouldSave && text && collectClipboardFiles(transfer).every((file) => file.type.startsWith("image/"))) {
        captureInlineInsertion()(text);
      }
    }
  }

  function keepAsText(attachment: PastedTextAttachment) {
    if (!pastedTextFiles || blockWhileReading()) return;
    const insertInline = captureInlineInsertion();
    void queue.enqueue(() => pastedTextFiles.read(attachment.filePath), (text) => {
      insertInline(text);
      onAttachmentsChange?.({
        attachments: (current) => current.filter((item) => item.kind !== "file" || item.filePath !== attachment.filePath),
      });
    }).catch(() => toast.warning(i18n.t("composer:pastedText.readFailed")));
  }

  return {
    handlePaste, attachTransfer, keepAsText, blockWhileReading, pending,
    acceptsFiles: Boolean(onAttachmentsChange || onPasteFiles),
  };
}
