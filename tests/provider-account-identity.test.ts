import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
  ProviderAccountIdentityCache,
  probeProviderAccountIdentity,
  type IdentityProbeDeps,
  type ProbedIdentity,
} from "../electron/provider-accounts/identity";
import { describeProviderAccountIdentity } from "../src/lib/providers/provider-account-identity";

// Fabricated values only; nothing here touches a real CLI or credential file.
function base64url(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
const CODEX_AUTH_FILE = JSON.stringify({
  OPENAI_API_KEY: null,
  tokens: {
    id_token: `${base64url({ alg: "none" })}.${base64url({
      email: "dev@example.com",
      "https://api.openai.com/auth": { chatgpt_plan_type: "pro" },
    })}.sig`,
    access_token: "SENTINEL-ACCESS-TOKEN",
    refresh_token: "SENTINEL-REFRESH-TOKEN",
  },
});

interface Call {
  executablePath: string;
  commandArgs: readonly string[];
  env: Record<string, string | undefined>;
}
function fakeDeps(overrides: Partial<IdentityProbeDeps> & { result?: Awaited<ReturnType<IdentityProbeDeps["run"]>>; files?: Record<string, string> } = {}) {
  const calls: Call[] = [];
  const reads: string[] = [];
  const deps: IdentityProbeDeps = {
    resolveExecutable: ({ providerId }) => `/fake/bin/${providerId === "claude-code" ? "claude" : "codex"}`,
    buildEnv: ({ providerId, profileId }) =>
      providerId === "claude-code"
        ? { CLAUDE_CONFIG_DIR: `/fake/accounts/${profileId}` }
        : { CODEX_HOME: `/fake/accounts/${profileId}` },
    run: async (args) => {
      calls.push({ executablePath: args.executablePath, commandArgs: args.commandArgs, env: args.env });
      return overrides.result ?? { status: 0, stdout: "", text: "", timedOut: false };
    },
    readTextFile: async (filePath) => {
      reads.push(filePath);
      const content = overrides.files?.[filePath];
      if (content === undefined) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return content;
    },
    homeDirectory: () => "/fake/home",
    ...overrides,
  };
  return { deps, calls, reads };
}

describe("identity probe", () => {
  test("runs claude auth status with the account's own environment and reads signed-in JSON", async () => {
    const { deps, calls } = fakeDeps({
      result: {
        status: 0,
        stdout: JSON.stringify({ loggedIn: true, email: "dev@example.com", subscriptionType: "pro" }),
        text: "",
        timedOut: false,
      },
    });
    const result = await probeProviderAccountIdentity({ providerId: "claude-code", profileId: "account-1" }, deps);
    expect(result).toEqual({ state: "signed-in", email: "dev@example.com", plan: "Pro" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.commandArgs).toEqual(["auth", "status", "--json"]);
    expect(calls[0]!.env.CLAUDE_CONFIG_DIR).toBe("/fake/accounts/account-1");
  });

  test("reads claude's signed-out answer even though the CLI exits non-zero", async () => {
    const { deps } = fakeDeps({
      result: { status: 1, stdout: JSON.stringify({ loggedIn: false, authMethod: "none" }), text: "", timedOut: false },
    });
    expect(await probeProviderAccountIdentity({ providerId: "claude-code", profileId: "a" }, deps)).toEqual({ state: "signed-out" });
  });

  test("reports unknown without detail when the CLI is missing, slow, broken or unrecognised", async () => {
    expect(
      await probeProviderAccountIdentity(
        { providerId: "claude-code", profileId: "a" },
        fakeDeps({ resolveExecutable: () => "" }).deps,
      ),
    ).toEqual({ state: "unknown", reason: "cli-missing" });
    expect(
      await probeProviderAccountIdentity(
        { providerId: "claude-code", profileId: "a" },
        fakeDeps({ result: { status: null, stdout: "", text: "", timedOut: true } }).deps,
      ),
    ).toEqual({ state: "unknown", reason: "failed" });
    expect(
      await probeProviderAccountIdentity(
        { providerId: "codex", profileId: "a" },
        fakeDeps({ result: { status: null, stdout: "", text: "", timedOut: false, error: "spawn failed" } }).deps,
      ),
    ).toEqual({ state: "unknown", reason: "failed" });
    expect(
      await probeProviderAccountIdentity(
        { providerId: "claude-code", profileId: "a" },
        fakeDeps({ result: { status: 0, stdout: "something new", text: "", timedOut: false } }).deps,
      ),
    ).toEqual({ state: "unknown", reason: "unreadable" });
    expect(
      await probeProviderAccountIdentity(
        { providerId: "claude-code", profileId: "a" },
        fakeDeps({
          buildEnv: () => {
            throw new Error("/Users/someone/secret/path is gone");
          },
        }).deps,
      ),
    ).toEqual({ state: "unknown", reason: "failed" });
  });

  test("codex reads email and plan from the profile's auth.json only for a ChatGPT login", async () => {
    const authPath = path.join("/fake/accounts/account-2", "auth.json");
    const { deps, calls, reads } = fakeDeps({
      result: { status: 0, stdout: "", text: "Logged in using ChatGPT", timedOut: false },
      files: { [authPath]: CODEX_AUTH_FILE },
    });
    const result = await probeProviderAccountIdentity({ providerId: "codex", profileId: "account-2" }, deps);
    expect(result).toEqual({ state: "signed-in", email: "dev@example.com", plan: "Pro" });
    expect(calls[0]!.commandArgs).toEqual(["login", "status"]);
    expect(reads).toEqual([authPath]);
    expect(JSON.stringify(result)).not.toContain("SENTINEL");
  });

  test("codex falls back to the default home when the environment names none", async () => {
    const authPath = path.join("/fake/home", ".codex", "auth.json");
    const { deps, reads } = fakeDeps({
      buildEnv: () => ({}),
      result: { status: 0, stdout: "", text: "Logged in using ChatGPT", timedOut: false },
      files: { [authPath]: CODEX_AUTH_FILE },
    });
    expect(await probeProviderAccountIdentity({ providerId: "codex", profileId: "system-default" }, deps)).toMatchObject({
      state: "signed-in",
      email: "dev@example.com",
    });
    expect(reads).toEqual([authPath]);
  });

  test("codex never opens auth.json for an API-key login or a signed-out account", async () => {
    for (const result of [
      { status: 0, stdout: "", text: "Logged in using an API key - sk-***ABCDE", timedOut: false },
      { status: 1, stdout: "", text: "Not logged in", timedOut: false },
    ]) {
      const { deps, reads } = fakeDeps({ result, files: { "/fake/accounts/a/auth.json": CODEX_AUTH_FILE } });
      const probed = await probeProviderAccountIdentity({ providerId: "codex", profileId: "a" }, deps);
      expect(reads).toEqual([]);
      expect(JSON.stringify(probed)).not.toContain("sk-");
    }
  });

  test("codex is signed in without identity when the file is missing or unreadable", async () => {
    const { deps } = fakeDeps({ result: { status: 0, stdout: "", text: "Logged in using ChatGPT", timedOut: false } });
    expect(await probeProviderAccountIdentity({ providerId: "codex", profileId: "a" }, deps)).toEqual({
      state: "signed-in",
      email: null,
      plan: null,
    });
  });
});

describe("identity cache", () => {
  const signedIn: ProbedIdentity = { state: "signed-in", email: "dev@example.com", plan: "Pro" };
  const args = { providerId: "claude-code", profileId: "a" } as const;

  test("serves a signed-in answer for minutes and other answers for seconds", async () => {
    let now = 1_000;
    let probes = 0;
    let answer: ProbedIdentity = signedIn;
    const cache = new ProviderAccountIdentityCache(async () => {
      probes += 1;
      return answer;
    }, () => now);
    expect((await cache.get(args)).state).toBe("signed-in");
    now += 60_000;
    await cache.get(args);
    expect(probes).toBe(1);
    now += 10 * 60_000;
    answer = { state: "signed-out" };
    expect((await cache.get(args)).state).toBe("signed-out");
    expect(probes).toBe(2);
    now += 5_000;
    await cache.get(args);
    expect(probes).toBe(2);
    now += 20_000;
    await cache.get(args);
    expect(probes).toBe(3);
  });

  test("stamps checkedAt and lets refresh skip the cache", async () => {
    let probes = 0;
    const cache = new ProviderAccountIdentityCache(async () => {
      probes += 1;
      return signedIn;
    }, () => 5_000);
    expect((await cache.get(args)).checkedAt).toBe(5_000);
    await cache.get({ ...args, refresh: true });
    expect(probes).toBe(2);
  });

  test("shares one probe between simultaneous reads", async () => {
    let probes = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const cache = new ProviderAccountIdentityCache(async () => {
      probes += 1;
      await gate;
      return signedIn;
    });
    const first = cache.get(args);
    const second = cache.get(args);
    release();
    await Promise.all([first, second]);
    expect(probes).toBe(1);
  });

  test("a refresh started after a slow read wins the cache", async () => {
    const answers: Array<{ identity: ProbedIdentity; release: () => void; gate: Promise<void> }> = [];
    const next = (identity: ProbedIdentity) => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      answers.push({ identity, release, gate });
    };
    next({ state: "signed-out" });
    next(signedIn);
    let index = 0;
    const cache = new ProviderAccountIdentityCache(async () => {
      const current = answers[index++]!;
      await current.gate;
      return current.identity;
    });
    const stale = cache.get(args);
    const fresh = cache.get({ ...args, refresh: true });
    answers[1]!.release();
    await fresh;
    answers[0]!.release();
    await stale;
    expect((await cache.get(args)).state).toBe("signed-in");
  });

  test("runs at most two probes at once", async () => {
    let active = 0;
    let peak = 0;
    const cache = new ProviderAccountIdentityCache(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return signedIn;
    });
    await Promise.all(["a", "b", "c", "d", "e"].map((profileId) => cache.get({ providerId: "codex", profileId })));
    expect(peak).toBe(2);
  });

  test("forgets accounts that no longer exist", async () => {
    let probes = 0;
    const cache = new ProviderAccountIdentityCache(async () => {
      probes += 1;
      return signedIn;
    });
    await cache.get(args);
    cache.retainOnly(new Set());
    await cache.get(args);
    expect(probes).toBe(2);
  });
});

describe("identity copy", () => {
  test("says who is signed in, briefly", () => {
    const at = 1;
    expect(describeProviderAccountIdentity({ state: "signed-in", email: "dev@example.com", plan: "Max", checkedAt: at }, "Claude").text).toBe(
      "Signed in as dev@example.com · Max",
    );
    expect(describeProviderAccountIdentity({ state: "signed-in", email: "dev@example.com", plan: null, checkedAt: at }, "Claude").text).toBe(
      "Signed in as dev@example.com",
    );
    expect(describeProviderAccountIdentity({ state: "signed-in", email: null, plan: "Pro", checkedAt: at }, "Codex").text).toBe("Signed in · Pro");
    expect(describeProviderAccountIdentity({ state: "signed-in", email: null, plan: null, checkedAt: at }, "Codex").text).toBe("Signed in");
    expect(describeProviderAccountIdentity({ state: "signed-out", checkedAt: at }, "Codex")).toEqual({ text: "Not signed in", tone: "attention" });
    expect(describeProviderAccountIdentity({ state: "unknown", reason: "failed", checkedAt: at }, "Codex").text).toBe("Can't check sign-in");
    expect(describeProviderAccountIdentity({ state: "unknown", reason: "cli-missing", checkedAt: at }, "Codex").text).toBe("Codex CLI not found");
    expect(describeProviderAccountIdentity(undefined, "Codex")).toEqual({ text: "Checking sign-in…", tone: "quiet" });
  });
});
