export function hasPromptSubmitPayload(args: {
  text: string;
  attachedFilePaths: readonly unknown[];
  imageAttachments: readonly unknown[];
  lensAnnotationAttachments: readonly unknown[];
  promptBatch: readonly {
    content: string;
    attachedFilePaths?: readonly unknown[];
    attachments?: readonly unknown[];
  }[];
}) {
  return (
    args.text.trim().length > 0 ||
    args.attachedFilePaths.length > 0 ||
    args.imageAttachments.length > 0 ||
    args.lensAnnotationAttachments.length > 0 ||
    args.promptBatch.some(
      (item) =>
        item.content.trim().length > 0 ||
        (item.attachedFilePaths?.length ?? 0) > 0 ||
        (item.attachments?.length ?? 0) > 0,
    )
  );
}
