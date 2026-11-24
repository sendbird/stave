import { i18n } from "@/i18n";
import { type ClipboardEvent, type RefObject, useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import { toast } from "@/components/ui";
import { pastedTextBlockRegistry, type PastedTextBlock } from "@/lib/pasted-text-blocks";
import type { Attachment, PastedTextAttachment } from "@/types/chat";
import {
  collectClipboardFiles,
  createClipboardReadQueue,
  mergeClipboardImageAttachments,
  partitionClipboardFiles,
  readClipboardImage,
} from "./prompt-input.clipboard";
import { getPastedTextBlock, queuePastedTextAttachment, restorePastedTextBlock } from "./prompt-input-pasted-text";
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
  /** Draft scope for collapsed pasted text. Omit to paste long text as plain text. */
  pastedTextBlockScope?: string;
}) {
  const { onAttachmentsChange, onPasteFiles, pastedTextFiles } = args;
  // A different draft owns different queued reads and recovery callbacks.
  const queue = useMemo(createClipboardReadQueue, [args.attachmentScopeId, args.workspaceCwd]);
  useLayoutEffect(() => () => queue.cancel(), [queue]);
  const pending = useSyncExternalStore(queue.subscribe, queue.isPending, queue.isPending);

  function captureInlineInsertion(replaceSelection = true) {
    const original = args.valueRef.current;
    const selection = args.editorRef.current?.getSelectionRange();
    return (text: string) => {
      const current = args.valueRef.current;
      const unchanged = current === original;
      const start = unchanged && selection ? (replaceSelection ? selection.start : selection.end) : current.length;
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

  function attachTransfer(transfer: Pick<DataTransfer, "items" | "files">): boolean {
    const { imageFiles, nonImageFiles } = partitionClipboardFiles(collectClipboardFiles(transfer));
    const images = onAttachmentsChange ? imageFiles : [];
    const files = onAttachmentsChange ? nonImageFiles : [...nonImageFiles, ...imageFiles];
    const hasFiles = Boolean(onPasteFiles && files.length > 0);
    if (!hasFiles && images.length === 0) return false;

    void queue.enqueue(async () => {
      const [newImages] = await Promise.all([
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
        hasFiles ? onPasteFiles?.({ files }) : undefined,
      ]);
      return newImages.filter((image) => image !== null);
    }, (newImages) => {
      if (newImages.length) onAttachmentsChange?.({
        attachments: (current) => {
          const existing = current.filter((item) => item.kind === "image");
          const included = new Set(mergeClipboardImageAttachments({ existing, incoming: newImages }));
          return [...current, ...newImages.filter((item) => included.has(item))];
        },
      });
    }).catch(() => toast.error(i18n.t("composer:promptInput.copy4")));
    return true;
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const transfer = event.clipboardData;
    if (!transfer) return;
    const text = transfer.getData("text/plain");
    const handledFiles = attachTransfer(transfer);
    const block = getPastedTextBlock(args.pastedTextBlockScope, text);
    if (!handledFiles && !block) return;

    event.preventDefault();
    event.stopPropagation();
    // Preserve the inline caption when pasting images, and collapse long text
    // even if clipboard files are also present.
    if (block || (text && collectClipboardFiles(transfer).every((file) => file.type.startsWith("image/")))) {
      captureInlineInsertion()(block?.text ?? text);
    }
  }

  function attachPastedText(block: PastedTextBlock, removeBlock: () => boolean) {
    if (!pastedTextFiles || !onAttachmentsChange || blockWhileReading()) return;
    void queuePastedTextAttachment({
      queue, block, save: pastedTextFiles.save, removeBlock,
      addAttachment: (saved) => onAttachmentsChange({ attachments: (current) => [...current, saved] }),
    }).catch(() => toast.warning(i18n.t("composer:pastedText.saveFailed")));
  }

  function keepAsText(attachment: PastedTextAttachment) {
    if (!pastedTextFiles || !onAttachmentsChange || blockWhileReading()) return;
    const insertInline = captureInlineInsertion(false);
    void queue.enqueue(() => pastedTextFiles.read(attachment.filePath), (text) => {
      restorePastedTextBlock(args.pastedTextBlockScope, text, insertInline, () => {
        onAttachmentsChange({
          attachments: (current) => current.filter((item) => item.kind !== "file" || item.filePath !== attachment.filePath),
        });
      });
    }).catch(() => toast.warning(i18n.t("composer:pastedText.readFailed")));
  }

  return {
    handlePaste, attachTransfer, keepAsText, blockWhileReading, pending,
    attachPastedText: pastedTextFiles && onAttachmentsChange ? attachPastedText : undefined,
    acceptsFiles: Boolean(onAttachmentsChange || onPasteFiles),
  };
}

const NO_PASTED_TEXT_BLOCKS: readonly PastedTextBlock[] = [];

/** The collapsed pasted text registered for one draft scope. */
export function usePastedTextBlocks(scopeId: string | undefined): readonly PastedTextBlock[] {
  const read = () => scopeId ? pastedTextBlockRegistry.get(scopeId) : NO_PASTED_TEXT_BLOCKS;
  return useSyncExternalStore(pastedTextBlockRegistry.subscribe, read, read);
}
