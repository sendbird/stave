import { describe, expect, test } from "bun:test";
import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { sx } from "@/components/ads/utils/stylex";
import {
  GIT_GRAPH_LANE_PALETTE,
  GitGraphCanvas,
} from "@/components/git-graph/GitGraphCanvas";
import { gitGraphCanvasStyles } from "@/components/git-graph/git-graph-canvas.styles";
import {
  GitGraphToolbar,
  shouldSeparateRemoteBranches,
} from "@/components/git-graph/GitGraphToolbar";
import { gitGraphToolbarStyles } from "@/components/git-graph/git-graph-toolbar.styles";
import {
  GitGraphWorkingTreeRow,
  ROW_HEIGHT,
} from "@/components/git-graph/GitGraphRow";

describe("Commit graph toolbar", () => {
  test("separates remote branches only when a local branch section precedes them", () => {
    expect(
      shouldSeparateRemoteBranches({
        localBranchCount: 0,
        remoteBranchCount: 1,
      }),
    ).toBe(false);
    expect(
      shouldSeparateRemoteBranches({
        localBranchCount: 1,
        remoteBranchCount: 1,
      }),
    ).toBe(true);
  });

  test("uses a two-row compact layout and exposes unavailable status", () => {
    const html = renderToStaticMarkup(
      createElement(GitGraphToolbar, {
        head: "main",
        availableRefs: [],
        selectedRefs: [],
        workingTree: {
          staged: 0,
          unstaged: 0,
          untracked: 0,
          conflicts: 0,
        },
        workingTreeAvailable: false,
        loadedCount: 300,
        hasMore: true,
        loading: false,
        fetching: false,
        searchQuery: "a very long commit search without matches",
        matchPosition: 0,
        matchCount: 0,
        columns: {
          author: true,
          date: true,
          hash: true,
        },
        onSelectedRefsChange: () => {},
        onSearchQueryChange: () => {},
        onPreviousMatch: () => {},
        onNextMatch: () => {},
        onLocateHead: () => {},
        onFetch: () => {},
        onRefresh: () => {},
        onColumnsChange: () => {},
        searchInputRef: createRef<HTMLInputElement>(),
      }),
    );

    expect(html).toContain('data-testid="git-graph-toolbar"');
    // The compact layout is carried by the toolbar root grid and the search
    // lane; assert the StyleX classes they compile to are actually applied
    // rather than the removed Tailwind utility strings.
    expect(html).toContain(sx(gitGraphToolbarStyles.root));
    expect(html).toContain(sx(gitGraphToolbarStyles.searchWrap));
    // A query with no matches reserves room for the match-count controls.
    expect(html).toContain(sx(gitGraphToolbarStyles.searchInputWithMatches));
    expect(html).toContain('aria-label="Working tree status unavailable"');
  });

  test("does not describe staged and unstaged status buckets as unique files", () => {
    const html = renderToStaticMarkup(
      createElement(GitGraphWorkingTreeRow, {
        summary: {
          staged: 1,
          unstaged: 1,
          untracked: 0,
          conflicts: 0,
        },
        graphWidth: 80,
        columns: {
          author: true,
          date: true,
          hash: true,
        },
        columnWidths: {
          author: 150,
          date: 118,
          hash: 82,
        },
        isSelected: false,
        onClick: () => {},
      }),
    );

    expect(html).toContain("2 changes");
    expect(html).not.toContain("2 files");
  });

  test("renders the commit graph's compact geometry and default line treatment", () => {
    const html = renderToStaticMarkup(
      createElement(GitGraphCanvas, {
        commits: [
          {
            hash: "head",
            parents: ["root"],
            author: "A",
            authorEmail: "",
            authorDate: "2026-01-01T00:00:00.000Z",
            committerDate: "2026-01-01T00:00:00.000Z",
            subject: "head",
            refs: [],
          },
          {
            hash: "root",
            parents: [],
            author: "A",
            authorEmail: "",
            authorDate: "2025-01-01T00:00:00.000Z",
            committerDate: "2025-01-01T00:00:00.000Z",
            subject: "root",
            refs: [],
          },
        ],
        headHash: "head",
        workingTree: {
          staged: 1,
          unstaged: 0,
          untracked: 0,
          conflicts: 0,
        },
        selection: null,
        searchMatches: new Set<string>(),
        searchQuery: "",
        columns: {
          author: true,
          date: true,
          hash: true,
        },
        columnWidths: {
          author: 150,
          date: 118,
          hash: 82,
        },
        hasMore: false,
        loadingMore: false,
        onSelectCommit: () => {},
        onSelectWorkingTree: () => {},
        onCommitContextMenu: () => {},
        onRefContextMenu: () => {},
        onRefDoubleClick: () => {},
        onColumnWidthChange: () => {},
        onEndReached: () => {},
      }),
    );

    expect(ROW_HEIGHT).toBe(24);
    expect(GIT_GRAPH_LANE_PALETTE).toEqual([
      "#2B6FE8",
      "#D43F82",
      "#258A52",
      "#C45A22",
      "#8662D6",
      "#D94848",
      "#16869E",
      "#B457C4",
      "#5F8D2B",
      "#A87412",
      "#596ED9",
      "#1D8572",
    ]);
    expect(html).toContain(sx(gitGraphCanvasStyles.svg));
    expect(html).not.toContain("stroke-dasharray");
    expect(html.match(/<circle/g)).toHaveLength(3);
    expect(html).toContain('stroke="#808080"');
    expect(html.match(/<circle[^>]+fill="#2B6FE8"/g)).toHaveLength(2);
  });
});
