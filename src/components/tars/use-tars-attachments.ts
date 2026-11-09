import { useRef, useState } from "react";
import { useTranslation } from "@/i18n";
import { readClipboardImage } from "@/components/ai-elements/prompt-input.clipboard";
import { AttachmentContextsSchema, type AttachmentContext } from "@/lib/providers/attachment-context";

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
  return { type: "file_context", filePath: file.name, content, language: file.name.split(".").at(-1) ?? "text" };
}

export function useTarsAttachments() {
  const { t } = useTranslation(["shell"]);
  const [parts, setParts] = useState<AttachmentContext[]>([]);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readingRef = useRef(false);
  const picker = useRef<HTMLInputElement>(null);
  async function add(files: File[]) {
    if (readingRef.current || !files.length) return;
    readingRef.current = true; setReading(true); setError(null);
    try {
      if (files.length > 8) throw new Error("Too many files.");
      const added = await Promise.all(files.map(readTarsAttachment));
      const next = [...new Map([...parts, ...added].map((part) => [attachmentName(part), part])).values()];
      setParts(AttachmentContextsSchema.parse(next));
    } catch { setError(t("shell:tars.conversation.attachments.failed")); }
    finally { readingRef.current = false; setReading(false); }
  }
  return { parts, reading, error, picker, add,
    keep: (names: string[]) => { setParts((current) => current.filter((part) => names.includes(attachmentName(part)))); setError(null); },
    clear: () => { setParts([]); setError(null); },
  };
}
