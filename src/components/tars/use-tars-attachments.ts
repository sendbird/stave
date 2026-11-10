import { useRef, useState } from "react";
import { useTranslation } from "@/i18n";
import { readClipboardImage } from "@/components/ai-elements/prompt-input.clipboard";
import { AttachmentContextsSchema, type AttachmentContext } from "@/lib/providers/attachment-context";
import { finishTarsDraftRead, setTarsDraftAttachments, startTarsDraftRead, useTarsDraftStore } from "@/store/tars-draft-store";

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const TEXT_EXTENSIONS = /\.(?:txt|md|mdx|csv|tsv|json|jsonl|ya?ml|xml|html?|css|scss|[cm]?[jt]sx?|py|rb|rs|go|java|kt|swift|sh|sql|toml|ini|log|diff|patch|svg)$/i;
export const attachmentName = (part: AttachmentContext) => part.type === "file_context" ? part.filePath : part.label;

/** Read selected bytes once, before send. Retries and replay use the same snapshot. */
export async function readTarsAttachment(file: File): Promise<AttachmentContext> {
  if (IMAGE_TYPES.has(file.type)) {
    if (file.size > 4_000_000) throw new Error("Image too large.");
    return AttachmentContextsSchema.parse([{ type: "image_context", label: file.name, mimeType: file.type, dataUrl: await readClipboardImage(file) }])[0]!;
  }
  if (file.size > 32_000 || !(file.type.startsWith("text/") || TEXT_EXTENSIONS.test(file.name))) throw new Error("Unsupported or oversized file.");
  const content = await file.text();
  if (content.includes("\0")) throw new Error("Binary file.");
  return { type: "file_context", filePath: file.name, content, language: file.name.trim().split(".").at(-1) ?? "text" };
}

/**
 * The composer's attached files. They live with the draft (`tars-draft-store`),
 * so they stay when the user leaves Tars and comes back, and changing them
 * makes the next send a new message. So does a read in progress: a view opened
 * while it runs waits for it, and a read that ends after its draft was sent or
 * replaced is dropped rather than added to the next draft.
 */
export function useTarsAttachments() {
  const { t } = useTranslation(["shell"]);
  const parts = useTarsDraftStore((draft) => draft.attachments);
  const reading = useTarsDraftStore((draft) => draft.reading);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  async function add(files: File[]) {
    if (!files.length) return;
    const read = startTarsDraftRead();
    if (!read) return;
    setError(null);
    let added: AttachmentContext[] | null = null;
    try {
      if (files.length > 8) throw new Error("Too many files.");
      added = await Promise.all(files.map(readTarsAttachment));
    } catch { added = null; }
    // The draft these files were read for was sent or replaced meanwhile: they are not the next draft's.
    if (!finishTarsDraftRead(read)) return;
    try {
      if (!added) throw new Error("Unreadable files.");
      const next = [...useTarsDraftStore.getState().attachments];
      const names = new Set(next.map(attachmentName));
      for (const part of added) {
        const original = attachmentName(part).trim();
        const dot = original.lastIndexOf(".");
        const extension = dot > 0 ? original.slice(dot) : "";
        const stem = extension ? original.slice(0, dot) : original;
        let name = original;
        for (let number = 2; names.has(name); number++) {
          const suffix = ` (${number})${extension}`;
          name = suffix.length < 500 ? `${stem.slice(0, 500 - suffix.length)}${suffix}` : `${original.slice(0, 480)} (${number})`;
        }
        names.add(name);
        next.push(part.type === "file_context" ? { ...part, filePath: name } : { ...part, label: name });
      }
      setTarsDraftAttachments(AttachmentContextsSchema.parse(next));
    } catch { setError(t("shell:tars.conversation.attachments.failed")); }
  }
  return { parts, reading, error, picker, add,
    keep: (names: string[]) => {
      const current = useTarsDraftStore.getState().attachments;
      const kept = current.filter((part) => names.includes(attachmentName(part)));
      // Nothing removed is no edit: the request ID a retry needs stays.
      if (kept.length !== current.length) setTarsDraftAttachments(kept);
      setError(null);
    },
  };
}
