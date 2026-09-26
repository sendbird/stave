export function appendWorkflowDraft(
  current: string,
  instruction: string,
): string {
  return current.trim()
    ? `${current.trimEnd()}\n\n${instruction}`
    : instruction;
}
