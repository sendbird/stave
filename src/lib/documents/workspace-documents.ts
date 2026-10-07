import { diffLines, splitLines } from "@/components/ads/components/DiffViewer.diff";
import {
  LEGACY_WORKSPACE_PLANS_DIRECTORY,
  parseWorkspacePlanFilePath,
  WORKSPACE_PLANS_DIRECTORY,
} from "@/lib/plans";
import type { CanonicalRetrievedContextPart } from "@/lib/providers/provider.types";
import {
  MAX_WORKSPACE_DOCUMENT_CHARS,
  MAX_WORKSPACE_DOCUMENTS_PER_SYNC,
  type WorkspaceDocumentChange,
} from "./workspace-document-schemas";

/** Directories whose Markdown files are workspace documents, newest first. */
export const WORKSPACE_DOCUMENT_DIRECTORIES = [
  WORKSPACE_PLANS_DIRECTORY,
  LEGACY_WORKSPACE_PLANS_DIRECTORY,
] as const;

export const WORKSPACE_DOCUMENT_EDITS_SOURCE_ID = "stave:document-edits";

/** Per-document and total budgets for the edit diff sent with a prompt. */
const MAX_DOCUMENT_EDIT_CHARS = 6_000;
const MAX_DOCUMENT_EDITS_TOTAL_CHARS = 12_000;
/** Line-diff work cap; larger rewrites are summarized instead of diffed. */
const MAX_DIFF_CELLS = 2_000_000;

export interface WorkspaceDocumentFile {
  filePath: string;
  content: string;
}

/**
 * Reads every Markdown document in the workspace's document directories. Files
 * over the size cap, unreadable files and missing directories are skipped.
 */
export async function readWorkspaceDocuments(
  rootPath: string,
): Promise<WorkspaceDocumentFile[]> {
  const fsApi = window.api?.fs;
  if (!fsApi?.listDirectory || !fsApi.readFile) {
    return [];
  }
  const listings = await Promise.all(
    WORKSPACE_DOCUMENT_DIRECTORIES.map((directoryPath) =>
      fsApi.listDirectory?.({ rootPath, directoryPath }).catch(() => null),
    ),
  );
  const filePaths = listings
    .flatMap((listing) => (listing?.ok ? listing.entries : []))
    .filter((entry) => entry.type === "file" && entry.path.endsWith(".md"))
    .map((entry) => entry.path)
    .sort()
    .slice(0, MAX_WORKSPACE_DOCUMENTS_PER_SYNC);
  const files = await Promise.all(
    filePaths.map(async (filePath) => {
      const result = await fsApi
        .readFile?.({ rootPath, filePath })
        .catch(() => null);
      if (
        !result?.ok ||
        result.tooLarge ||
        result.content.length > MAX_WORKSPACE_DOCUMENT_CHARS
      ) {
        return null;
      }
      return { filePath, content: result.content };
    }),
  );
  return files.filter((file): file is WorkspaceDocumentFile => file !== null);
}

/**
 * The first Markdown heading, else the label the Information panel shows: the
 * file name without `.md`, or the time in a task-named file.
 */
export function getWorkspaceDocumentTitle(args: {
  filePath: string;
  content?: string | null;
}): string {
  const heading = args.content
    ?.split(/\r?\n/u)
    .find((line) => /^#{1,6}\s+\S/u.test(line));
  if (heading) {
    return heading.replace(/^#{1,6}\s+/u, "").trim();
  }
  return parseWorkspacePlanFilePath(args.filePath).label;
}

function truncate(value: string, maxChars: number) {
  return value.length <= maxChars
    ? value
    : `${value.slice(0, maxChars)}\n… (diff truncated)`;
}

/**
 * A compact line diff: changed lines prefixed with `-`/`+` and their line
 * number, one line of unchanged context around each change, and `…` for
 * skipped stretches. Rewrites too large to diff are summarized.
 */
export function buildWorkspaceDocumentDiff(args: {
  before: string;
  after: string;
  maxChars?: number;
}): string {
  const before = splitLines(args.before);
  const after = splitLines(args.after);
  if (before.length * after.length > MAX_DIFF_CELLS) {
    return `The document was rewritten (${before.length} lines → ${after.length} lines); read the file for its current content.`;
  }
  const ops = diffLines(before, after);
  const keep = new Set<number>();
  ops.forEach((op, index) => {
    if (op.type !== "equal") {
      keep.add(index - 1);
      keep.add(index);
      keep.add(index + 1);
    }
  });
  const lines: string[] = [];
  let skipped = false;
  ops.forEach((op, index) => {
    if (!keep.has(index)) {
      skipped = true;
      return;
    }
    if (skipped && lines.length > 0) {
      lines.push("…");
    }
    skipped = false;
    if (op.type === "equal") {
      lines.push(`  ${op.afterLine ?? ""}: ${op.text}`);
    } else if (op.type === "remove") {
      lines.push(`- ${op.beforeLine ?? ""}: ${op.text}`);
    } else {
      lines.push(`+ ${op.afterLine ?? ""}: ${op.text}`);
    }
  });
  return truncate(lines.join("\n"), args.maxChars ?? MAX_DOCUMENT_EDIT_CHARS);
}

/**
 * Retrieved context telling the agent which of its documents changed since it
 * last saw them, with the diff. Only documents this task wrote before are
 * included; a brand-new document or another task's document is left out.
 */
export function buildWorkspaceDocumentEditContextPart(
  changes: readonly WorkspaceDocumentChange[],
): CanonicalRetrievedContextPart | null {
  const relevant = changes.filter(
    (change) => change.touchedByTask && change.previousContent !== null,
  );
  if (relevant.length === 0) {
    return null;
  }
  let remaining = MAX_DOCUMENT_EDITS_TOTAL_CHARS;
  const sections: string[] = [];
  for (const change of relevant) {
    if (remaining <= 0) {
      sections.push(`- ${change.filePath}: also changed (diff omitted).`);
      continue;
    }
    const diff = buildWorkspaceDocumentDiff({
      before: change.previousContent ?? "",
      after: change.content,
      maxChars: Math.min(MAX_DOCUMENT_EDIT_CHARS, remaining),
    });
    remaining -= diff.length;
    sections.push(
      [
        `Document \`${change.filePath}\` (revision ${change.previousRevision} → ${change.revision}):`,
        "```diff",
        diff,
        "```",
      ].join("\n"),
    );
  }
  return {
    type: "retrieved_context",
    sourceId: WORKSPACE_DOCUMENT_EDITS_SOURCE_ID,
    title: "Document edits since your last turn", // i18n-ignore: model-facing retrieved-context title
    content: [
      "These workspace documents you wrote earlier in this task were edited outside your turns, by the user or another tool. Treat the current file as the source of truth and keep the edits unless the user asks otherwise.",
      "",
      ...sections,
    ].join("\n"),
  };
}
