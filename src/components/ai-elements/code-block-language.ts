/**
 * Common fence names that have no grammar of their own but read correctly with
 * a loaded one: the JSON grammar already colors `//` and `/* *\/` comments, and
 * `golang` and `patch` are other names for Go and a unified diff. Without
 * these, the fence silently fell back to plain text while its label still
 * named a language.
 */
const LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  jsonc: "json",
  golang: "go",
  patch: "diff",
};

/** Plain fences have no syntax grammar, including the common text aliases. */
export function resolveCodeBlockLanguage(language?: string): string | null {
  const normalized = language?.trim().toLowerCase();
  if (!normalized || ["text", "plaintext", "plain", "txt"].includes(normalized)) return null;
  return LANGUAGE_ALIASES[normalized] ?? normalized;
}
