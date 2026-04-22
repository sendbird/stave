/**
 * User-defined repo map configuration.
 *
 * Place in `.stave/repo-map.config.json` at the workspace root.
 * All sections are optional — when omitted, Stave uses convention-based
 * discovery so the feature works out of the box for any project.
 *
 * @example
 * ```json
 * {
 *   "version": 1,
 *   "docs": [
 *     { "path": "docs/architecture/index.md", "role": "architecture map" }
 *   ],
 *   "hotspots": [
 *     { "path": "src/store/root.ts", "reason": "central state", "score": 120 },
 *     { "path": "src/api/", "reason": "api surface", "score": 60, "pathPrefix": true }
 *   ],
 *   "entrypoints": [
 *     {
 *       "id": "auth-flow",
 *       "title": "Auth Flow",
 *       "summary": "Trace authentication from entry to token.",
 *       "filePaths": ["src/auth/index.ts", "src/auth/middleware.ts"]
 *     }
 *   ]
 * }
 * ```
 */
export interface RepoMapConfig {
  version: 1;

  /**
   * Curated list of documentation files to surface in Quick Open.
   *
   * When omitted, Stave discovers README.md, AGENTS.md, CLAUDE.md,
   * CONTRIBUTING.md, docs/**‌/*.md, and .claude/**‌/*.md automatically.
   *
   * Specifying this field replaces convention discovery entirely for docs,
   * so include all docs you want visible.
   */
  docs?: RepoMapConfigDoc[];

  /**
   * Files (or path prefixes) that deserve extra weight in the hotspot ranking,
   * stacked on top of the import-graph score.
   *
   * When omitted, hotspot ranking is based solely on the import graph.
   * Config hotspot bonuses are additive — a file can score via both graph
   * analysis and config bonuses simultaneously.
   */
  hotspots?: RepoMapConfigHotspot[];

  /**
   * Named "where to start" bundles shown in Quick Open.
   *
   * When omitted, Stave detects entrypoints from package.json main/exports
   * and common file-name conventions (src/index.ts, app/page.tsx, etc.).
   *
   * Specifying this field replaces convention detection entirely for
   * entrypoints, so include all bundles you want visible.
   */
  entrypoints?: RepoMapConfigEntrypoint[];
}

export interface RepoMapConfigDoc {
  /** Relative path from the workspace root. */
  path: string;
  /** Short role label shown in Quick Open (e.g. "architecture map"). */
  role: string;
}

export interface RepoMapConfigHotspot {
  /**
   * Relative path from the workspace root.
   * When `pathPrefix` is true, applies to all files whose path starts with
   * this value (e.g. `"src/api/"` matches `"src/api/users.ts"`).
   */
  path: string;
  /** Short reason label shown in Quick Open (e.g. "central store"). */
  reason: string;
  /**
   * Bonus score added to the import-graph score.
   * Typical ranges: 50–80 for important files, 100–150 for critical ones.
   */
  score: number;
  /**
   * If true, treats `path` as a directory prefix and applies the bonus to
   * all files whose path starts with it. Defaults to false.
   */
  pathPrefix?: boolean;
}

export interface RepoMapConfigEntrypoint {
  /** Stable identifier (kebab-case). Must be unique within the config. */
  id: string;
  /** Human-readable bundle title shown in Quick Open. */
  title: string;
  /** One-sentence description of what the bundle covers. */
  summary: string;
  /** Ordered list of relative file paths in this bundle. */
  filePaths: string[];
}
