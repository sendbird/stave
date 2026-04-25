import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RepoMapDocEntry, RepoMapEntrypoint, RepoMapHotspot, RepoMapSnapshot } from "../../../src/lib/fs/repo-map.types";
import { REPO_MAP_MAX_AGE_MS } from "../../../src/lib/fs/repo-map.types";
import type { RepoMapConfig } from "../../../src/lib/fs/repo-map-config.types";
import { listFilesRecursive } from "./filesystem";

const execFileAsync = promisify(execFile);

const REPO_MAP_VERSION = 1;

/** Extensions treated as code files for import-graph analysis. */
const CODE_FILE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

/** Module resolution suffixes tried in order when resolving an import specifier. */
const MODULE_RESOLUTION_SUFFIXES = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  "/index.ts",
  "/index.tsx",
  "/index.js",
  "/index.jsx",
  "/index.mjs",
  "/index.cjs",
] as const;

/**
 * Maximum number of code files to analyze for the import graph.
 * Files beyond this cap are counted in `codeFileCount` but not analyzed.
 * Files listed in the project config's `hotspots` are always analyzed
 * regardless of the cap.
 */
const MAX_ANALYSIS_FILES = 5_000;

/**
 * Maximum entries retained in the incremental analysis cache.
 * Excess entries (least recently analyzed) are pruned to prevent unbounded
 * cache growth across multiple refreshes that rotate through the analysis cap.
 */
const MAX_ANALYSIS_CACHE_ENTRIES = 8_000;

/**
 * Concurrency limit for `fs.readFile` calls.
 * Lower than stat concurrency because file content occupies memory.
 */
const READ_CONCURRENCY = 32;

/**
 * Concurrency limit for `fs.stat` calls.
 * Stat is a lightweight metadata-only syscall — high concurrency is safe.
 */
const STAT_CONCURRENCY = 128;

/** Maximum doc entries surfaced in the snapshot. */
const MAX_DOC_ENTRIES = 20;

// ─────────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────────

interface AnalyzedCodeFile {
  filePath: string;
  importCount: number;
  importedByCount: number;
  exportCount: number;
  score: number;
  reasons: string[];
}

/**
 * Per-file analysis entry persisted in the incremental cache.
 * Keyed by the file's relative path in `AnalysisCache.entries`.
 */
interface FileAnalysisEntry {
  /** Floor of `stat.mtimeMs` — used as a fast change-detection key. */
  mtime: number;
  /** `stat.size` — secondary change-detection key. */
  size: number;
  importCount: number;
  exportCount: number;
  /** Resolved relative paths of files this file imports. */
  resolvedImports: string[];
}

/**
 * Internal incremental analysis cache written alongside the snapshot.
 * Not exposed to the renderer — kept in `repo-map-analysis.json`.
 */
interface AnalysisCache {
  version: number;
  entries: Record<string, FileAnalysisEntry>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function isCodeFile(filePath: string) {
  return CODE_FILE_EXTENSIONS.has(path.extname(filePath));
}

function countPattern(content: string, pattern: RegExp) {
  return [...content.matchAll(pattern)].length;
}

function normalizeSlashes(value: string) {
  return value.replaceAll("\\", "/");
}

async function resolveGitDir(rootPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--git-dir"], {
      cwd: rootPath,
      encoding: "utf8",
    });
    const raw = stdout.trim();
    if (!raw) return null;
    return path.resolve(rootPath, raw);
  } catch {
    return null;
  }
}

async function readJsonIfExists<T>(targetPath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(targetPath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Returns the directory where snapshot and analysis cache are stored.
 * Prefers `<git-dir>/stave-cache/` so the cache is shared across worktrees
 * and is not accidentally committed. Falls back to `.stave/cache/`.
 */
async function resolveCacheDir(rootPath: string): Promise<string> {
  const gitDir = await resolveGitDir(rootPath);
  if (gitDir) {
    return path.join(gitDir, "stave-cache");
  }
  return path.join(rootPath, ".stave", "cache");
}

// ─────────────────────────────────────────────────────────────────────────────
// Config loading
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads `.stave/repo-map.config.json` from the workspace root.
 * Returns null when the file is absent, malformed, or has an unexpected version.
 */
async function loadProjectConfig(rootPath: string): Promise<RepoMapConfig | null> {
  const configPath = path.join(rootPath, ".stave", "repo-map.config.json");
  try {
    const raw = await fs.readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object"
      && parsed !== null
      && (parsed as Record<string, unknown>)["version"] === 1
    ) {
      return parsed as RepoMapConfig;
    }
    return null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Doc discovery
// ─────────────────────────────────────────────────────────────────────────────

/** Fixed convention-based doc candidates checked when no config is present. */
const FIXED_DOC_CONVENTIONS: RepoMapDocEntry[] = [
  { path: "README.md", role: "project overview" },
  { path: "README.mdx", role: "project overview" },
  { path: "AGENTS.md", role: "agent policy" },
  { path: "CLAUDE.md", role: "claude-specific guidance" },
  { path: "CONTRIBUTING.md", role: "contribution guide" },
  { path: "ARCHITECTURE.md", role: "architecture overview" },
  { path: "docs/README.md", role: "docs overview" },
];

/**
 * Resolves the list of documentation files to surface in the snapshot.
 *
 * - With config: uses `config.docs`, filtered to files that exist.
 * - Without config: fixed conventions + discovers `docs/**‌/*.md` and
 *   `.claude/**‌/*.md` up to `MAX_DOC_ENTRIES`.
 */
function resolveDocEntries(files: Set<string>, config: RepoMapConfig | null): RepoMapDocEntry[] {
  if (config?.docs && config.docs.length > 0) {
    return config.docs.filter((entry) => files.has(entry.path));
  }

  const result: RepoMapDocEntry[] = [];

  for (const conv of FIXED_DOC_CONVENTIONS) {
    if (files.has(conv.path)) {
      result.push(conv);
    }
  }

  for (const filePath of files) {
    if (result.length >= MAX_DOC_ENTRIES) break;
    const normalized = normalizeSlashes(filePath);
    if (result.some((d) => d.path === normalized)) continue;

    if (normalized.startsWith("docs/") && normalized.endsWith(".md")) {
      result.push({ path: normalized, role: "documentation" });
    } else if (normalized.startsWith(".claude/") && normalized.endsWith(".md")) {
      result.push({ path: normalized, role: "claude configuration" });
    }
  }

  return result.slice(0, MAX_DOC_ENTRIES);
}

// ─────────────────────────────────────────────────────────────────────────────
// Entrypoint detection
// ─────────────────────────────────────────────────────────────────────────────

interface ConventionPattern {
  id: string;
  title: string;
  summary: string;
  paths: string[];
}

const ENTRYPOINT_CONVENTIONS: ConventionPattern[] = [
  {
    id: "src-index",
    title: "Source Entry",
    summary: "Main source entry point.",
    paths: ["src/index.ts", "src/index.tsx", "src/index.js", "index.ts", "index.js"],
  },
  {
    id: "src-main",
    title: "App Root",
    summary: "Application root component or main module.",
    paths: [
      "src/main.ts",
      "src/main.tsx",
      "src/app.ts",
      "src/App.tsx",
      "src/app.tsx",
      "main.ts",
    ],
  },
  {
    id: "electron-main",
    title: "Electron Main",
    summary: "Electron main process entry.",
    paths: ["electron/main/index.ts", "electron/main.ts", "electron/main/index.js"],
  },
  {
    id: "server-entry",
    title: "Server Entry",
    summary: "Server or API entry point.",
    paths: ["server.ts", "server/index.ts", "api/index.ts", "server.js", "server/index.js"],
  },
  {
    id: "pages-root",
    title: "Root Page",
    summary: "Root page (Next.js / Remix convention).",
    paths: ["pages/index.tsx", "pages/index.ts", "app/page.tsx", "app/page.ts"],
  },
];

/**
 * Builds the entrypoint list for the snapshot.
 *
 * - With config: uses `config.entrypoints`, filtered to files that exist.
 * - Without config: reads `package.json` main/exports, then checks common
 *   file-name conventions.
 */
async function buildEntrypoints(
  files: Set<string>,
  rootPath: string,
  config: RepoMapConfig | null,
): Promise<RepoMapEntrypoint[]> {
  if (config?.entrypoints && config.entrypoints.length > 0) {
    return config.entrypoints
      .map((ep) => ({
        ...ep,
        filePaths: ep.filePaths.filter((p) => files.has(p)),
      }))
      .filter((ep) => ep.filePaths.length > 0);
  }

  // Convention-based detection
  const result: RepoMapEntrypoint[] = [];

  // Try package.json main / module / exports["."]
  try {
    const pkg = JSON.parse(
      await fs.readFile(path.join(rootPath, "package.json"), "utf8"),
    ) as Record<string, unknown>;

    const candidates: string[] = [];
    if (typeof pkg["main"] === "string") candidates.push(pkg["main"]);
    if (typeof pkg["module"] === "string") candidates.push(pkg["module"]);
    if (typeof pkg["exports"] === "object" && pkg["exports"] !== null) {
      const exportsMain = (pkg["exports"] as Record<string, unknown>)["."];
      if (typeof exportsMain === "string") candidates.push(exportsMain);
    }

    for (const candidate of candidates) {
      const normalized = normalizeSlashes(candidate.replace(/^\.\//, ""));
      if (files.has(normalized)) {
        result.push({
          id: "package-main",
          title: "Package Entry",
          summary: `Main entry from package.json: ${normalized}`,
          filePaths: [normalized],
        });
        break;
      }
    }
  } catch {
    // No package.json or unreadable — skip
  }

  // Common file-name conventions
  for (const pattern of ENTRYPOINT_CONVENTIONS) {
    const found = pattern.paths.filter((p) => files.has(p));
    if (found.length > 0 && !result.some((ep) => ep.id === pattern.id)) {
      result.push({
        id: pattern.id,
        title: pattern.title,
        summary: pattern.summary,
        filePaths: found,
      });
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hotspot bonus
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns config-specified bonus entries for `filePath`.
 * Supports both exact-path and prefix-path matches.
 */
function buildHotspotBonus(
  filePath: string,
  config: RepoMapConfig | null,
): Array<{ score: number; reason: string }> {
  if (!config?.hotspots || config.hotspots.length === 0) return [];

  const normalized = normalizeSlashes(filePath);
  const bonuses: Array<{ score: number; reason: string }> = [];

  for (const entry of config.hotspots) {
    const entryPath = normalizeSlashes(entry.path);
    const isMatch = entry.pathPrefix
      ? normalized.startsWith(entryPath)
      : normalized === entryPath;
    if (isMatch) {
      bonuses.push({ score: entry.score, reason: entry.reason });
    }
  }

  return bonuses;
}

// ─────────────────────────────────────────────────────────────────────────────
// Import extraction and resolution
// ─────────────────────────────────────────────────────────────────────────────

function extractImportSpecifiers(content: string): string[] {
  const specifiers = [
    ...content.matchAll(/\b(?:import|export)\s+[^"'\n]+?\s+from\s+["']([^"']+)["']/g),
    ...content.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g),
    ...content.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
  ];
  return specifiers
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);
}

function resolveImportToFile(args: {
  sourceFile: string;
  specifier: string;
  files: Set<string>;
}): string | null {
  const { specifier, sourceFile, files } = args;
  let basePath: string | null = null;

  if (specifier.startsWith("@/")) {
    basePath = `src/${specifier.slice(2)}`;
  } else if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const fromDirectory = path.dirname(sourceFile);
    basePath = normalizeSlashes(
      path.posix.normalize(path.posix.join(fromDirectory, specifier)),
    );
  } else {
    return null;
  }

  for (const suffix of MODULE_RESOLUTION_SUFFIXES) {
    const candidate = normalizeSlashes(`${basePath}${suffix}`);
    if (files.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parallel I/O helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs `fn` over every item with at most `concurrency` calls in flight at once.
 *
 * Unlike the chunked `for (i; i < n; i += C) await Promise.all(chunk)` pattern,
 * this worker-pool approach starts a new task the instant any slot frees.
 * Files that complete quickly do not hold back the rest of the batch,
 * which matters when file sizes (and therefore read times) vary widely.
 */
async function withPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const i = index++;
        if (i >= items.length) break;
        await fn(items[i]!);
      }
    },
  );
  await Promise.all(workers);
}

/**
 * Reads multiple files in parallel using a worker-pool, returning a Map of
 * relative path → file content.  Files that cannot be read are silently skipped.
 */
async function readFilesParallel(args: {
  filePaths: string[];
  rootPath: string;
}): Promise<Map<string, string>> {
  const contents = new Map<string, string>();
  await withPool(args.filePaths, READ_CONCURRENCY, async (filePath) => {
    try {
      contents.set(filePath, await fs.readFile(path.join(args.rootPath, filePath), "utf8"));
    } catch {
      // Skip unreadable files
    }
  });
  return contents;
}

/**
 * Stats multiple files in parallel using a worker-pool, returning mtime + size
 * for cache validation.  Uses a higher concurrency than reads because stat is a
 * lightweight metadata syscall that does not transfer file content.
 */
async function statFilesParallel(args: {
  filePaths: string[];
  rootPath: string;
}): Promise<Map<string, { mtime: number; size: number }>> {
  const stats = new Map<string, { mtime: number; size: number }>();
  await withPool(args.filePaths, STAT_CONCURRENCY, async (filePath) => {
    try {
      const s = await fs.stat(path.join(args.rootPath, filePath));
      stats.set(filePath, { mtime: Math.floor(s.mtimeMs), size: s.size });
    } catch {
      // Skip missing or unreadable entries
    }
  });
  return stats;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core analysis (incremental-aware)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analyzes code files to produce scored `AnalyzedCodeFile` entries.
 *
 * Incremental strategy
 * ─────────────────────
 * Selective stat (normal TTL-expiry refresh, `forceStatAll = false`):
 *   • Uncached files (new to the workspace): stat → read → analyze.
 *   • Cached files: trust cached mtime/size, skip stat, reuse analysis.
 *     Trade-off: edited files won't re-score until `forceStatAll = true`.
 *     Acceptable for a navigation tool — the user can click "refresh".
 *
 * Full stat (`forceStatAll = true`, triggered by explicit user refresh):
 *   • Stats every code file to detect any mtime/size change.
 *   • Changed files are re-read; unchanged files reuse the cache.
 *   • Guarantees hotspot data is fresh after any file edit.
 *
 * File cap
 * ─────────
 * Files specified in `config.hotspots` (non-prefix) are always analyzed.
 * Remaining slots (up to MAX_ANALYSIS_FILES) are filled with:
 *   - `forceStatAll`: most recently modified files (mtime sort).
 *   - selective: uncached files first (brand-new or was evicted), then
 *     cached files (already analyzed, unlikely to have changed).
 */
async function analyzeCodeFiles(args: {
  rootPath: string;
  codeFiles: string[];
  allFiles: Set<string>;
  config: RepoMapConfig | null;
  analysisCache: AnalysisCache | null;
  /**
   * When true, re-stats all code files for full accuracy.
   * When false (default), only stats uncached (new) files — much faster for
   * large repos on a routine TTL-expiry refresh.
   */
  forceStatAll?: boolean;
}): Promise<{ results: AnalyzedCodeFile[]; updatedCache: AnalysisCache }> {
  const { rootPath, codeFiles, allFiles, config, analysisCache, forceStatAll = false } = args;

  // Collect exact config-specified hotspot paths (non-prefix only — prefix
  // entries can't enumerate individual paths without scanning all files).
  const configHotspotPaths = new Set(
    (config?.hotspots ?? [])
      .filter((h) => !h.pathPrefix)
      .map((h) => normalizeSlashes(h.path)),
  );

  const cachedEntries = analysisCache?.entries ?? {};

  // ── Step 1: Determine which files to stat ──────────────────────────────────
  //
  // forceStatAll=true  → stat everything (full accuracy, user-initiated).
  // forceStatAll=false → only stat files absent from the analysis cache; for
  //                      cached files we trust the stored mtime/size.
  //                      This avoids O(all code files) stat calls on every
  //                      routine 5-minute refresh.
  const filesToStat = forceStatAll
    ? codeFiles
    : codeFiles.filter((f) => !(f in cachedEntries));

  const stats = await statFilesParallel({ filePaths: filesToStat, rootPath });

  // ── Step 2: Partition + select files to analyze (cap at MAX_ANALYSIS_FILES) ─
  const priorityFiles = codeFiles.filter((f) => configHotspotPaths.has(normalizeSlashes(f)));
  const otherFiles = codeFiles.filter((f) => !configHotspotPaths.has(normalizeSlashes(f)));

  if (forceStatAll) {
    // Sort by freshest mtime — prioritises actively edited files.
    otherFiles.sort((a, b) => (stats.get(b)?.mtime ?? 0) - (stats.get(a)?.mtime ?? 0));
  } else {
    // Uncached files first (new/unknown), then cached files.
    // Within each group, alphabetical order is fine.
    otherFiles.sort((a, b) => {
      const aIsNew = !(a in cachedEntries) ? 0 : 1;
      const bIsNew = !(b in cachedEntries) ? 0 : 1;
      return aIsNew - bIsNew || a.localeCompare(b);
    });
  }

  const remainingSlots = MAX_ANALYSIS_FILES - priorityFiles.length;
  const filesToAnalyze = [
    ...priorityFiles,
    ...otherFiles.slice(0, Math.max(0, remainingSlots)),
  ];

  // ── Step 3: Cache hit / miss classification ────────────────────────────────
  const filesToRead: string[] = [];
  const cachedAnalysis = new Map<
    string,
    Pick<FileAnalysisEntry, "importCount" | "exportCount" | "resolvedImports">
  >();

  for (const filePath of filesToAnalyze) {
    const cached = cachedEntries[filePath];

    if (cached) {
      if (forceStatAll) {
        // We have a fresh stat — validate mtime/size
        const stat = stats.get(filePath);
        if (stat && cached.mtime === stat.mtime && cached.size === stat.size) {
          cachedAnalysis.set(filePath, cached);
        } else {
          filesToRead.push(filePath);
        }
      } else {
        // Selective mode — trust the cache without re-stat
        cachedAnalysis.set(filePath, cached);
      }
    } else {
      // Not in cache — stat result is available (we stat'd all uncached files)
      const stat = stats.get(filePath);
      if (stat) {
        filesToRead.push(filePath);
      }
      // If stat failed (file disappeared between list and now), skip silently
    }
  }

  // ── Step 4: Read + parse only new / changed files (worker-pool) ───────────
  const contents = await readFilesParallel({ filePaths: filesToRead, rootPath });
  const newEntries: Record<string, FileAnalysisEntry> = {};

  for (const filePath of filesToRead) {
    const content = contents.get(filePath);
    // For forceStatAll: stat is in `stats`; for selective: uncached files are in `stats`.
    const stat = stats.get(filePath);
    if (!content || !stat) continue;

    const importSpecifiers = extractImportSpecifiers(content);
    const resolvedImports = [
      ...new Set(
        importSpecifiers
          .map((specifier) =>
            resolveImportToFile({ sourceFile: filePath, specifier, files: allFiles }),
          )
          .filter((r): r is string => Boolean(r)),
      ),
    ];

    const entry: FileAnalysisEntry = {
      mtime: stat.mtime,
      size: stat.size,
      importCount: importSpecifiers.length,
      exportCount: countPattern(
        content,
        /\bexport\s+(?:const|function|class|type|interface|enum)\b/g,
      ),
      resolvedImports,
    };

    newEntries[filePath] = entry;
    cachedAnalysis.set(filePath, entry);
  }

  // ── Step 5: Build importedByCount across all analyzed files ───────────────
  const importedByCount = new Map<string, number>();
  for (const [, analysis] of cachedAnalysis) {
    for (const resolvedImport of analysis.resolvedImports) {
      importedByCount.set(resolvedImport, (importedByCount.get(resolvedImport) ?? 0) + 1);
    }
  }

  // ── Step 6: Score each analyzed file ──────────────────────────────────────
  const results: AnalyzedCodeFile[] = [];
  for (const [filePath, analysis] of cachedAnalysis) {
    const reasons: string[] = [];
    let score = 0;

    const importedBy = importedByCount.get(filePath) ?? 0;
    if (analysis.importCount >= 8) {
      score += Math.min(30, analysis.importCount * 2);
      reasons.push(`many imports (${analysis.importCount})`);
    }
    if (importedBy >= 4) {
      score += Math.min(60, importedBy * 8);
      reasons.push(`widely referenced (${importedBy})`);
    }
    if (analysis.exportCount >= 4) {
      score += Math.min(24, analysis.exportCount * 3);
      reasons.push(`many exports (${analysis.exportCount})`);
    }

    for (const bonus of buildHotspotBonus(filePath, config)) {
      score += bonus.score;
      reasons.push(bonus.reason);
    }

    results.push({
      filePath,
      importCount: analysis.importCount,
      importedByCount: importedBy,
      exportCount: analysis.exportCount,
      score,
      reasons: reasons.length > 0 ? reasons : ["code file"],
    });
  }

  // ── Step 7: Merge new entries into cache; prune stale + excess entries ─────
  //
  // Pruning prevents unbounded cache growth when successive refreshes rotate
  // through different subsets of files (due to the analysis cap + mtime sort).
  const fileSet = new Set(codeFiles);
  const mergedEntries: Record<string, FileAnalysisEntry> = {};

  // Carry over cached entries for files still in the workspace
  for (const [key, entry] of Object.entries(cachedEntries)) {
    if (fileSet.has(key)) {
      mergedEntries[key] = entry;
    }
  }
  // Overlay freshly analyzed entries
  for (const [key, entry] of Object.entries(newEntries)) {
    mergedEntries[key] = entry;
  }

  // Cap total cache size — drop entries for files not in filesToAnalyze first
  let finalEntries = mergedEntries;
  if (Object.keys(mergedEntries).length > MAX_ANALYSIS_CACHE_ENTRIES) {
    const analyzed = new Set(filesToAnalyze);
    const kept: Record<string, FileAnalysisEntry> = {};
    // Priority-1: files we just analyzed (always keep)
    for (const key of filesToAnalyze) {
      if (key in mergedEntries) {
        kept[key] = mergedEntries[key]!;
      }
    }
    // Priority-2: fill remaining slots from other cached entries (arbitrary order)
    const remaining = MAX_ANALYSIS_CACHE_ENTRIES - Object.keys(kept).length;
    let count = 0;
    for (const [key, entry] of Object.entries(mergedEntries)) {
      if (!analyzed.has(key) && count < remaining) {
        kept[key] = entry;
        count++;
      }
    }
    finalEntries = kept;
  }

  return {
    results,
    updatedCache: { version: 1, entries: finalEntries },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hotspot picker
// ─────────────────────────────────────────────────────────────────────────────

function pickHotspots(analyzedFiles: AnalyzedCodeFile[]): RepoMapHotspot[] {
  return analyzedFiles
    .filter((file) => file.score > 0)
    .sort((left, right) => {
      const scoreDelta = right.score - left.score;
      if (scoreDelta !== 0) return scoreDelta;
      return left.filePath.localeCompare(right.filePath);
    })
    .slice(0, 12)
    .map((file) => ({
      filePath: file.filePath,
      score: file.score,
      importCount: file.importCount,
      importedByCount: file.importedByCount,
      exportCount: file.exportCount,
      reasons: file.reasons.slice(0, 4),
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Markdown formatter
// ─────────────────────────────────────────────────────────────────────────────

function formatRepoMapMarkdown(repoMap: RepoMapSnapshot): string {
  const lines = [
    "# Repo Map",
    "",
    `- Updated: ${repoMap.updatedAt}`,
    `- Root: ${repoMap.rootPath}`,
    `- Files: ${repoMap.fileCount} total / ${repoMap.codeFileCount} code`,
    "",
    "## Docs",
  ];

  if (repoMap.docs.length === 0) {
    lines.push("- none");
  } else {
    for (const doc of repoMap.docs) {
      lines.push(`- \`${doc.path}\` — ${doc.role}`);
    }
  }

  lines.push("", "## Entrypoints");
  if (repoMap.entrypoints.length === 0) {
    lines.push("- none");
  } else {
    for (const ep of repoMap.entrypoints) {
      lines.push(`- ${ep.title} — ${ep.summary}`);
      for (const fp of ep.filePaths.slice(0, 4)) {
        lines.push(`  - \`${fp}\``);
      }
    }
  }

  lines.push("", "## Hotspots");
  if (repoMap.hotspots.length === 0) {
    lines.push("- none");
  } else {
    for (const hotspot of repoMap.hotspots.slice(0, 10)) {
      lines.push(
        `- \`${hotspot.filePath}\` (${hotspot.score}) — ${hotspot.reasons.join(", ")}`,
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a fresh repo map snapshot without touching the disk cache.
 * Useful for testing and one-off generation. Does not apply incremental analysis.
 */
export async function generateRepoMapSnapshot(args: {
  rootPath: string;
}): Promise<RepoMapSnapshot> {
  const rootPath = path.resolve(args.rootPath);
  const [files, config] = await Promise.all([
    listFilesRecursive({ rootPath }),
    loadProjectConfig(rootPath),
  ]);
  const fileSet = new Set(files);
  const codeFiles = files.filter(isCodeFile);

  const [docs, entrypoints, { results }] = await Promise.all([
    Promise.resolve(resolveDocEntries(fileSet, config)),
    buildEntrypoints(fileSet, rootPath, config),
    analyzeCodeFiles({
      rootPath,
      codeFiles,
      allFiles: fileSet,
      config,
      analysisCache: null,
    }),
  ]);

  return {
    version: REPO_MAP_VERSION,
    updatedAt: new Date().toISOString(),
    rootPath,
    fileCount: files.length,
    codeFileCount: codeFiles.length,
    docs,
    hotspots: pickHotspots(results),
    entrypoints,
  };
}

/**
 * In-flight guard: if two callers request the same workspace concurrently
 * (e.g. TopBar + TurnDiagnosticsPanel both opening at startup), the second
 * caller attaches to the already-running promise instead of spawning a second
 * generation.  Entries are removed when the promise settles.
 */
const inFlightGenerations = new Map<
  string,
  Promise<{ repoMap: RepoMapSnapshot; source: "cache" | "generated"; cachePath: string }>
>();

/**
 * Returns a cached snapshot if fresh; otherwise generates, persists, and
 * returns a new one. Uses an incremental analysis cache so only changed
 * files are re-read on subsequent calls.
 *
 * Concurrency: concurrent calls for the same workspace share a single
 * in-flight promise — no duplicate generation ever happens.
 */
export async function getOrCreateRepoMap(args: {
  rootPath: string;
  refresh?: boolean;
  maxAgeMs?: number;
}): Promise<{ repoMap: RepoMapSnapshot; source: "cache" | "generated"; cachePath: string }> {
  const rootPath = path.resolve(args.rootPath);
  const maxAgeMs = args.maxAgeMs ?? REPO_MAP_MAX_AGE_MS;

  // Resolve cache directory (git-dir preferred) concurrently with config load
  const [cacheDir, config] = await Promise.all([
    resolveCacheDir(rootPath),
    loadProjectConfig(rootPath),
  ]);

  const cachePath = path.join(cacheDir, "repo-map.json");
  const analysisCachePath = path.join(cacheDir, "repo-map-analysis.json");

  // Check snapshot cache before doing any file I/O
  if (!args.refresh) {
    const cached = await readJsonIfExists<RepoMapSnapshot>(cachePath);
    if (cached?.updatedAt) {
      const updatedAtMs = Date.parse(cached.updatedAt);
      if (Number.isFinite(updatedAtMs) && Date.now() - updatedAtMs < maxAgeMs) {
        return { repoMap: cached, source: "cache", cachePath };
      }
    }
  }

  // Deduplicate concurrent generation requests for the same workspace.
  // Key includes `refresh` so a forced refresh isn't blocked by a non-forced
  // in-flight generation (they may use different stat strategies).
  const inFlightKey = `${rootPath}:${args.refresh ? "force" : "normal"}`;
  const existing = inFlightGenerations.get(inFlightKey);
  if (existing) {
    return existing;
  }

  const promise = generateAndPersist({
    rootPath,
    cacheDir,
    cachePath,
    analysisCachePath,
    config,
    forceStatAll: args.refresh === true,
  }).finally(() => {
    inFlightGenerations.delete(inFlightKey);
  });

  inFlightGenerations.set(inFlightKey, promise);
  return promise;
}

/** Internal: generates a fresh snapshot and writes all cache artifacts. */
async function generateAndPersist(args: {
  rootPath: string;
  cacheDir: string;
  cachePath: string;
  analysisCachePath: string;
  config: RepoMapConfig | null;
  forceStatAll: boolean;
}): Promise<{ repoMap: RepoMapSnapshot; source: "generated"; cachePath: string }> {
  const { rootPath, cacheDir, cachePath, analysisCachePath, config, forceStatAll } = args;

  // Cache miss — generate a fresh snapshot
  const [files, analysisCache] = await Promise.all([
    listFilesRecursive({ rootPath }),
    readJsonIfExists<AnalysisCache>(analysisCachePath),
  ]);

  const fileSet = new Set(files);
  const codeFiles = files.filter(isCodeFile);

  const [docs, entrypoints, { results, updatedCache }] = await Promise.all([
    Promise.resolve(resolveDocEntries(fileSet, config)),
    buildEntrypoints(fileSet, rootPath, config),
    analyzeCodeFiles({
      rootPath,
      codeFiles,
      allFiles: fileSet,
      config,
      analysisCache,
      forceStatAll,
    }),
  ]);

  const repoMap: RepoMapSnapshot = {
    version: REPO_MAP_VERSION,
    updatedAt: new Date().toISOString(),
    rootPath,
    fileCount: files.length,
    codeFileCount: codeFiles.length,
    docs,
    hotspots: pickHotspots(results),
    entrypoints,
  };

  // Write snapshot, incremental cache, and markdown in parallel
  await fs.mkdir(cacheDir, { recursive: true });
  await Promise.all([
    fs.writeFile(cachePath, JSON.stringify(repoMap, null, 2), "utf8"),
    fs.writeFile(analysisCachePath, JSON.stringify(updatedCache), "utf8"),
    fs.writeFile(
      path.join(cacheDir, "repo-map.md"),
      formatRepoMapMarkdown(repoMap),
      "utf8",
    ),
  ]);

  return { repoMap, source: "generated", cachePath };
}
