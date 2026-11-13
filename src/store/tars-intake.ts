import { AttachmentContextsSchema } from "@/lib/providers/attachment-context";
import type { TarsIntakeDraft } from "@/lib/tars/intake";
import { TARS_MESSAGE_MAX_CHARS } from "@/lib/tars/types";
import { appendTarsDraft, setTarsDraftAttachments, useTarsDraftStore } from "./tars-draft-store";

/** Validate the combined draft first. An intake must never erase unsent direction. */
export function stageTarsIntake(draft: TarsIntakeDraft): void {
  const current = useTarsDraftStore.getState();
  if (current.reading) throw new Error("Draft attachments are being read.");
  const text = current.text.trim() ? `${current.text.trimEnd()}\n\n${draft.text}` : draft.text;
  if (text.length > TARS_MESSAGE_MAX_CHARS) throw new Error("Draft too long.");
  const names = new Set(current.attachments.map((part) => part.type === "file_context" ? part.filePath : part.label));
  const additions = draft.attachments.map((part) => {
    const original = part.type === "file_context" ? part.filePath : part.label;
    let name = original;
    for (let index = 2; names.has(name); index++) name = `${index}-${original}`.slice(0, 500);
    names.add(name);
    return part.type === "file_context" ? { ...part, filePath: name } : { ...part, label: name };
  });
  const attachments = AttachmentContextsSchema.parse([...current.attachments, ...additions]);
  appendTarsDraft(draft.text);
  setTarsDraftAttachments(attachments);
}
