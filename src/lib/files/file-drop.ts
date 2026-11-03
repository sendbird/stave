/**
 * What a file picker or a drop area accepts. A dropped file bypasses the
 * input's `accept` filter, so every import checks the same rule itself.
 */
export interface FileAcceptRule {
  /** Lowercase extensions with the dot, such as `.json`. A matching name is enough. */
  extensions?: readonly string[];
  /** MIME types; a matching type is enough. */
  mimeTypes?: readonly string[];
  maxBytes: number;
}

/** Why a file was refused, in the order it is checked: the wrong kind first, then too large. */
export type FileRejectionReason = "type" | "size";

export function rejectFile(file: Pick<File, "name" | "type" | "size">, rule: FileAcceptRule): FileRejectionReason | null {
  const name = file.name.toLowerCase();
  const typeMatches = (rule.mimeTypes ?? []).includes(file.type);
  const extensionMatches = (rule.extensions ?? []).some((extension) => name.endsWith(extension));
  if (!typeMatches && !extensionMatches) return "type";
  if (file.size > rule.maxBytes) return "size";
  return null;
}

/** The `accept` attribute for the same rule, so the picker and the drop agree. */
export function acceptAttribute(rule: FileAcceptRule): string {
  return [...(rule.extensions ?? []), ...(rule.mimeTypes ?? [])].join(",");
}

/**
 * Whether a drag carries files from the operating system, as opposed to
 * text, a link or an in-app payload (a task row). Only the types are
 * readable during the drag; the files themselves arrive with the drop.
 */
export function dragCarriesFiles(types: ArrayLike<string> | readonly string[] | null | undefined): boolean {
  if (!types) return false;
  return Array.from(types).includes("Files");
}
