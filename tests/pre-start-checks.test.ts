import { describe, expect, test } from "bun:test";
import {
  canStartWith,
  evaluatePreStartChecks,
  readGitHubStatus,
  type PreStartFacts,
} from "../src/lib/missions/pre-start-checks";
import { starterPlaybook } from "./fixtures/mission-fixtures";

const READY = { state: "ready", reason: null, detail: null } as const;

function facts(patch: Partial<PreStartFacts> = {}): PreStartFacts {
  return {
    playbook: starterPlaybook("request-to-pr"),
    providerSupported: true,
    reporting: READY,
    github: { state: "authenticated", pullRequest: null },
    dirtyFileCount: 0,
    dirtyAcknowledged: false,
    activeMission: false,
    ...patch,
  };
}

function states(checks: ReturnType<typeof evaluatePreStartChecks>) {
  return Object.fromEntries(checks.map((check) => [check.id, check.state]));
}

describe("pre-start checks", () => {
  test("everything ready enables Start", () => {
    const checks = evaluatePreStartChecks(facts());
    expect(states(checks)).toEqual({ task: "pass", mission: "pass", reporting: "pass", github: "pass", workspace: "pass" });
    expect(canStartWith(checks)).toBe(true);
  });

  test("Local MCP off, a running mission or an unsupported provider block the start with a reason", () => {
    const off = evaluatePreStartChecks(
      facts({ reporting: { state: "unavailable", reason: "server-disabled", detail: "The Local MCP server is turned off." } }),
    );
    expect(off.find((check) => check.id === "reporting")).toMatchObject({ state: "fail" });
    expect(off.find((check) => check.id === "reporting")!.detail).toContain("cannot report its stages");
    expect(canStartWith(off)).toBe(false);
    expect(canStartWith(evaluatePreStartChecks(facts({ activeMission: true })))).toBe(false);
    expect(canStartWith(evaluatePreStartChecks(facts({ providerSupported: false })))).toBe(false);
  });

  test("gh is checked only when the playbook has PR actions, and a signed-out gh blocks", () => {
    const signedOut = evaluatePreStartChecks(
      facts({ github: { state: "unauthenticated", detail: "Run `gh auth login`." } }),
    );
    expect(states(signedOut).github).toBe("fail");
    expect(canStartWith(signedOut)).toBe(false);
    const noActions = evaluatePreStartChecks(
      facts({
        playbook: { stages: starterPlaybook("request-to-pr").stages.filter((stage) => stage.kind === "ai") },
        github: { state: "unauthenticated", detail: "" },
      }),
    );
    expect(states(noActions).github).toBeUndefined();
    expect(canStartWith(noActions)).toBe(true);
  });

  test("an open branch PR is adopted, and a playbook that needs one refuses without it", () => {
    const adopted = evaluatePreStartChecks(
      facts({ github: { state: "authenticated", pullRequest: { number: 612, url: "https://x/612", isDraft: true } } }),
    );
    expect(adopted.find((check) => check.id === "pull-request")!.detail).toContain("PR #612");
    const needsExisting = evaluatePreStartChecks(facts({ playbook: starterPlaybook("fix-failing-checks") }));
    expect(states(needsExisting)["pull-request"]).toBe("fail");
    expect(canStartWith(needsExisting)).toBe(false);
  });

  test("uncommitted files need an acknowledgement, not a clean tree", () => {
    const dirty = evaluatePreStartChecks(facts({ dirtyFileCount: 3 }));
    expect(dirty.find((check) => check.id === "workspace")!.detail).toContain("3 uncommitted files");
    expect(canStartWith(dirty)).toBe(false);
    expect(canStartWith(evaluatePreStartChecks(facts({ dirtyFileCount: 3, dirtyAcknowledged: true })))).toBe(true);
  });

  test("pending reads keep Start off until they answer", () => {
    expect(canStartWith(evaluatePreStartChecks(facts({ reporting: { state: "unknown", reason: null, detail: null } })))).toBe(false);
    expect(canStartWith(evaluatePreStartChecks(facts({ github: { state: "pending" } })))).toBe(false);
  });

  test("the PR status call is read into a GitHub status", () => {
    expect(readGitHubStatus({ ok: false, pr: null, stderr: "GitHub CLI is not authenticated. Run `gh auth login` first." }).state).toBe(
      "unauthenticated",
    );
    expect(readGitHubStatus({ ok: true, pr: null })).toEqual({ state: "authenticated", pullRequest: null });
    expect(
      readGitHubStatus({ ok: true, pr: { number: 9, url: "u", isDraft: false, state: "MERGED" } }),
    ).toEqual({ state: "authenticated", pullRequest: null });
    expect(readGitHubStatus({ ok: false, pr: null, stderr: "no pull requests found for branch" }).state).toBe("authenticated");
    expect(readGitHubStatus(null).state).toBe("unknown");
  });
});
