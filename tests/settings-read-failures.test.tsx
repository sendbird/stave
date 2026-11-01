import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LocalMcpRequestLogCard } from "../src/components/layout/settings-dialog-developer-section";
import { kickoffServerVerdict } from "../src/components/layout/settings-dialog-kickoff-section";
import {
  parseGitRemotes,
  RepositoryRemoteList,
  repositoryRemotesState,
  type RepositoryMetadataState,
} from "../src/components/layout/settings-sections/settings-dialog-repository-status";

const noop = () => {};

describe("repository remotes", () => {
  const ready: RepositoryMetadataState = { status: "ready", rootPath: "/repo", remotes: [], detail: "No git remotes configured." };
  const origin = parseGitRemotes({
    stdout: "origin\tgit@example.com:team/repo.git (fetch)\norigin\tgit@example.com:team/repo.git (push)\n",
  });

  test("a failed git remote read is an error, not no remotes", () => {
    const state = repositoryRemotesState({ ...ready, remotesError: "fatal: not a git repository" });
    expect(state).toEqual({ status: "error", error: "fatal: not a git repository" });
    const html = renderToStaticMarkup(createElement(RepositoryRemoteList, { state, onRetry: noop }));
    expect(html).toContain("fatal: not a git repository");
    expect(html).toContain("Retry");
    expect(html).not.toContain("No remotes configured.");
  });

  test("no remotes only after the read answered, and a refresh keeps what it showed", () => {
    expect(repositoryRemotesState(ready)).toEqual({ status: "ready", data: [] });
    expect(repositoryRemotesState({ ...ready, status: "loading" })).toEqual({ status: "pending" });
    expect(repositoryRemotesState({ ...ready, status: "loading", remotes: origin })).toEqual({ status: "ready", data: origin });
    expect(origin).toEqual([{ name: "origin", fetchUrl: "git@example.com:team/repo.git", pushUrl: "git@example.com:team/repo.git" }]);
  });
});

describe("Developer and Kickoff before their reads answer", () => {
  test("the request log says it is loading, not that there are no requests", () => {
    const html = renderToStaticMarkup(createElement(LocalMcpRequestLogCard));
    expect(html).toContain("Loading local MCP request logs...");
    expect(html).not.toContain("No requests yet.");
  });

  test("Kickoff calls a server missing only when every configuration was read", () => {
    expect(kickoffServerVerdict({ found: false, discovered: false, failed: false })).toBe("checking");
    expect(kickoffServerVerdict({ found: false, discovered: true, failed: false })).toBe("missing");
    // A failed or partial read may have skipped the configuration that names it.
    expect(kickoffServerVerdict({ found: false, discovered: true, failed: true })).toBe("unknown");
    expect(kickoffServerVerdict({ found: false, discovered: false, failed: true })).toBe("unknown");
    expect(kickoffServerVerdict({ found: true, discovered: true, failed: true })).toBe("found");
  });
});
