/** Plain fences have no syntax grammar, including the common text aliases. */
export function resolveCodeBlockLanguage(language?: string): string | null {
  const normalized = language?.trim().toLowerCase();
  return !normalized || ["text", "plaintext", "plain", "txt"].includes(normalized)
    ? null
    : normalized;
}
