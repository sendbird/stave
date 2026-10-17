import { describe, expect, test } from "bun:test";
import {
  MAX_CACHED_WORKSPACE_FILE_LISTS,
  evictColdWorkspaceFileCacheEntries,
  getCachedWorkspaceFiles,
  rememberCachedWorkspaceFiles,
  resolveInitialWorkspaceFiles,
} from "@/store/workspace-file-cache";

function fillCache(count: number) {
  let cache: Record<string, string[]> = {};
  for (let index = 0; index < count; index += 1) {
    cache = rememberCachedWorkspaceFiles({
      workspaceFileCacheByPath: cache,
      workspacePath: `/repo/worktree-${index}`,
      files: [`file-${index}.ts`],
    });
  }
  return cache;
}

describe("workspace file cache LRU", () => {
  test("keeps at most the cap, evicting the least recently written path", () => {
    const cache = fillCache(MAX_CACHED_WORKSPACE_FILE_LISTS + 2);
    const paths = Object.keys(cache);
    expect(paths).toHaveLength(MAX_CACHED_WORKSPACE_FILE_LISTS);
    expect(paths).not.toContain("/repo/worktree-0");
    expect(paths).not.toContain("/repo/worktree-1");
    expect(paths.at(-1)).toBe(
      `/repo/worktree-${MAX_CACHED_WORKSPACE_FILE_LISTS + 1}`,
    );
  });

  test("writing an existing path marks it most recent so it survives", () => {
    let cache = fillCache(MAX_CACHED_WORKSPACE_FILE_LISTS);
    // Same content: only the recency changes, and the list keeps its reference.
    const originalList = cache["/repo/worktree-0"];
    cache = rememberCachedWorkspaceFiles({
      workspaceFileCacheByPath: cache,
      workspacePath: "/repo/worktree-0",
      files: ["file-0.ts"],
    });
    expect(cache["/repo/worktree-0"]).toBe(originalList);
    cache = rememberCachedWorkspaceFiles({
      workspaceFileCacheByPath: cache,
      workspacePath: "/repo/new",
      files: ["new.ts"],
    });
    expect(Object.keys(cache)).toContain("/repo/worktree-0");
    expect(Object.keys(cache)).not.toContain("/repo/worktree-1");
  });

  test("returns the same record when the newest path is rewritten unchanged", () => {
    const cache = fillCache(3);
    expect(
      rememberCachedWorkspaceFiles({
        workspaceFileCacheByPath: cache,
        workspacePath: "/repo/worktree-2",
        files: ["file-2.ts"],
      }),
    ).toBe(cache);
  });

  test("never evicts retained paths such as the repository root", () => {
    let cache = rememberCachedWorkspaceFiles({
      workspaceFileCacheByPath: {},
      workspacePath: "/repo",
      files: ["root.ts"],
    });
    for (let index = 0; index < MAX_CACHED_WORKSPACE_FILE_LISTS + 5; index += 1) {
      cache = rememberCachedWorkspaceFiles({
        workspaceFileCacheByPath: cache,
        workspacePath: `/repo/worktree-${index}`,
        files: [`file-${index}.ts`],
        retainPaths: ["/repo/"],
      });
    }
    expect(Object.keys(cache)).toHaveLength(MAX_CACHED_WORKSPACE_FILE_LISTS);
    expect(cache["/repo"]).toEqual(["root.ts"]);
  });

  test("stays over the cap rather than evicting only retained paths", () => {
    const cache = { "/a": ["a"], "/b": ["b"], "/c": ["c"] };
    expect(
      evictColdWorkspaceFileCacheEntries({
        workspaceFileCacheByPath: cache,
        retainPaths: ["/a", "/b", "/c"],
        limit: 2,
      }),
    ).toBe(cache);
  });

  test("an evicted path reads as uncached, so callers list its files again", () => {
    const cache = fillCache(MAX_CACHED_WORKSPACE_FILE_LISTS + 1);
    expect(
      getCachedWorkspaceFiles({
        workspacePath: "/repo/worktree-0",
        workspaceFileCacheByPath: cache,
      }),
    ).toEqual([]);
    expect(
      resolveInitialWorkspaceFiles({
        workspacePath: "/repo/worktree-0",
        activeRepositoryPath: "/repo",
        activeRepositoryFiles: ["root.ts"],
        workspaceFileCacheByPath: cache,
      }),
    ).toEqual([]);
  });
});
