import { describe, expect, test } from "bun:test";
import {
  checkoutDefaultBranchDetached,
  resolveOriginDefaultRef,
  type ScmCommandRunner,
} from "../electron/host-service/scm-runtime";

type CommandCall = { command: string; commandArgs: string[] };

function createRunner(
  handle: (call: CommandCall) => Partial<{
    ok: boolean;
    code: number;
    stdout: string;
    stderr: string;
  }>,
) {
  const calls: CommandCall[] = [];
  const runCommand: ScmCommandRunner = async (args) => {
    const call = { command: args.command, commandArgs: args.commandArgs ?? [] };
    calls.push(call);
    const result = handle(call);
    return {
      ok: result.ok ?? true,
      code: result.code ?? (result.ok ?? true ? 0 : 1),
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  };
  return { calls, runCommand };
}

const CLEAN_TREE = "";

function respondToDetachedSequence(args: {
  availableRefs: string[];
  status?: string;
  fetchOk?: boolean;
  checkoutOk?: boolean;
}) {
  return (call: CommandCall) => {
    const joined = call.commandArgs.join(" ");
    if (joined.startsWith("fetch")) {
      return args.fetchOk === false
        ? { ok: false, code: 128, stderr: "could not read from remote" }
        : { ok: true };
    }
    if (joined.startsWith("rev-parse --verify")) {
      const ref = call.commandArgs.at(-1) ?? "";
      return { ok: args.availableRefs.includes(ref) };
    }
    if (joined.startsWith("status")) {
      return { ok: true, stdout: args.status ?? CLEAN_TREE };
    }
    if (joined.startsWith("checkout --detach")) {
      return args.checkoutOk === false
        ? { ok: false, code: 1, stderr: "checkout refused" }
        : { ok: true, stdout: "HEAD is now at 1a2b3c4" };
    }
    if (joined.startsWith("rev-parse --short")) {
      return { ok: true, stdout: "1a2b3c4\n" };
    }
    throw new Error(`Unexpected command: git ${joined}`);
  };
}

describe("resolveOriginDefaultRef", () => {
  test("prefers origin/main", async () => {
    const { calls, runCommand } = createRunner((call) => ({
      ok: call.commandArgs.at(-1) === "refs/remotes/origin/main",
    }));

    expect(await resolveOriginDefaultRef({ runCommand })).toEqual({
      ok: true,
      ref: "origin/main",
      stderr: "",
    });
    expect(calls).toHaveLength(1);
  });

  test("falls back to origin/master", async () => {
    const { calls, runCommand } = createRunner((call) => ({
      ok: call.commandArgs.at(-1) === "refs/remotes/origin/master",
    }));

    const result = await resolveOriginDefaultRef({ runCommand });
    expect(result.ok).toBe(true);
    expect(result.ref).toBe("origin/master");
    expect(calls.map((call) => call.commandArgs.at(-1))).toEqual([
      "refs/remotes/origin/main",
      "refs/remotes/origin/master",
    ]);
  });

  test("fails when neither remote default branch exists", async () => {
    const { runCommand } = createRunner(() => ({ ok: false }));

    const result = await resolveOriginDefaultRef({ runCommand });
    expect(result.ok).toBe(false);
    expect(result.ref).toBe("");
    expect(result.stderr).toContain("origin/main");
    expect(result.stderr).toContain("origin/master");
  });
});

describe("checkoutDefaultBranchDetached", () => {
  test("fetches, resolves the ref, then detaches HEAD", async () => {
    const { calls, runCommand } = createRunner(
      respondToDetachedSequence({ availableRefs: ["refs/remotes/origin/main"] }),
    );

    const result = await checkoutDefaultBranchDetached({ runCommand });

    expect(result.ok).toBe(true);
    expect(result.ref).toBe("origin/main");
    expect(result.head).toBe("1a2b3c4");
    expect(calls.map((call) => call.commandArgs.join(" "))).toEqual([
      "fetch origin --prune",
      "rev-parse --verify --quiet refs/remotes/origin/main",
      "status --porcelain --untracked-files=all -z",
      "checkout --detach origin/main",
      "rev-parse --short HEAD",
    ]);
  });

  test("detaches onto origin/master when origin/main is absent", async () => {
    const { runCommand } = createRunner(
      respondToDetachedSequence({
        availableRefs: ["refs/remotes/origin/master"],
      }),
    );

    const result = await checkoutDefaultBranchDetached({ runCommand });
    expect(result.ok).toBe(true);
    expect(result.ref).toBe("origin/master");
  });

  test("stops when the fetch fails and never checks out", async () => {
    const { calls, runCommand } = createRunner(
      respondToDetachedSequence({
        availableRefs: ["refs/remotes/origin/main"],
        fetchOk: false,
      }),
    );

    const result = await checkoutDefaultBranchDetached({ runCommand });
    expect(result.ok).toBe(false);
    expect(result.ref).toBe("");
    expect(result.stderr).toContain("could not read from remote");
    expect(calls).toHaveLength(1);
  });

  test("reports a missing remote default branch without checking out", async () => {
    const { calls, runCommand } = createRunner(
      respondToDetachedSequence({ availableRefs: [] }),
    );

    const result = await checkoutDefaultBranchDetached({ runCommand });
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("origin/master");
    expect(
      calls.some((call) => call.commandArgs.includes("--detach")),
    ).toBe(false);
  });

  test("refuses to detach while the working tree is dirty", async () => {
    const { calls, runCommand } = createRunner(
      respondToDetachedSequence({
        availableRefs: ["refs/remotes/origin/main"],
        status: " M src/app.ts\n",
      }),
    );

    const result = await checkoutDefaultBranchDetached({ runCommand });
    expect(result.ok).toBe(false);
    expect(result.ref).toBe("origin/main");
    expect(result.head).toBe("");
    expect(result.stderr).toContain("uncommitted changes");
    expect(
      calls.some((call) => call.commandArgs.includes("--detach")),
    ).toBe(false);
  });

  test("surfaces a checkout failure", async () => {
    const { runCommand } = createRunner(
      respondToDetachedSequence({
        availableRefs: ["refs/remotes/origin/main"],
        checkoutOk: false,
      }),
    );

    const result = await checkoutDefaultBranchDetached({ runCommand });
    expect(result.ok).toBe(false);
    expect(result.ref).toBe("origin/main");
    expect(result.head).toBe("");
    expect(result.stderr).toContain("checkout refused");
  });
});
