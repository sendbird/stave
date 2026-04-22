/**
 * How long a cached repo map snapshot is considered fresh.
 * Shared across main process and renderer to keep staleness checks in sync.
 */
export const REPO_MAP_MAX_AGE_MS = 5 * 60 * 1000;

export interface RepoMapDocEntry {
  path: string;
  role: string;
}

export interface RepoMapHotspot {
  filePath: string;
  score: number;
  importCount: number;
  importedByCount: number;
  exportCount: number;
  reasons: string[];
}

export interface RepoMapEntrypoint {
  id: string;
  title: string;
  summary: string;
  filePaths: string[];
}

export interface RepoMapSnapshot {
  version: number;
  updatedAt: string;
  rootPath: string;
  fileCount: number;
  codeFileCount: number;
  docs: RepoMapDocEntry[];
  hotspots: RepoMapHotspot[];
  entrypoints: RepoMapEntrypoint[];
}

export interface RepoMapResponse {
  ok: boolean;
  repoMap?: RepoMapSnapshot;
  source?: "cache" | "generated";
  stderr?: string;
}

/**
 * Formats a repo-map snapshot into a compact text block suitable for
 * injection as retrieved context at the start of an AI turn.
 *
 * Keeps the output small (~300-600 tokens) so it doesn't dominate the
 * context window on large codebases.
 */
export function formatRepoMapForContext(snapshot: RepoMapSnapshot): string {
  const lines: string[] = [
    `# Codebase Map`,
    `Generated: ${snapshot.updatedAt} | Files: ${snapshot.fileCount} total, ${snapshot.codeFileCount} code`,
    "",
  ];

  if (snapshot.docs.length > 0) {
    lines.push("## Read first (guides)");
    for (const doc of snapshot.docs.slice(0, 8)) {
      lines.push(`- ${doc.path} (${doc.role})`);
    }
    lines.push("");
  }

  if (snapshot.entrypoints.length > 0) {
    lines.push("## Entrypoints");
    for (const ep of snapshot.entrypoints.slice(0, 6)) {
      const files = ep.filePaths.slice(0, 2).join(", ");
      lines.push(`- **${ep.title}**: ${files} — ${ep.summary}`);
    }
    lines.push("");
  }

  if (snapshot.hotspots.length > 0) {
    lines.push("## Hotspot files (high importance / widely referenced)");
    for (const h of snapshot.hotspots.slice(0, 12)) {
      lines.push(`- ${h.filePath} — ${h.reasons.join(", ")}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}
