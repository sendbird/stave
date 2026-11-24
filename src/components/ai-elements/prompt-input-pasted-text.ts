import {
  pastedTextBlockRegistry,
  shouldCollapsePastedText,
  type PastedTextBlock,
} from "@/lib/pasted-text-blocks";
import type { PastedTextAttachment } from "@/types/chat";

import type { createClipboardReadQueue } from "./prompt-input.clipboard";

export function getPastedTextBlock(scope: string | undefined, text: string) {
  return scope && shouldCollapsePastedText(text)
    ? pastedTextBlockRegistry.register(scope, text)
    : undefined;
}

export function queuePastedTextAttachment(args: {
  queue: ReturnType<typeof createClipboardReadQueue>;
  block: PastedTextBlock;
  save: (text: string) => Promise<PastedTextAttachment>;
  removeBlock: () => boolean;
  addAttachment: (attachment: PastedTextAttachment) => void;
}) {
  return args.queue.enqueue(() => args.save(args.block.text), (attachment) => {
    // The user may have removed the node or replaced the draft while saving.
    if (args.removeBlock()) args.addAttachment(attachment);
  });
}

export function restorePastedTextBlock(
  scope: string | undefined,
  text: string,
  insert: (text: string) => void,
  removeAttachment: () => void,
) {
  insert(scope ? pastedTextBlockRegistry.register(scope, text).text : text);
  removeAttachment();
}
