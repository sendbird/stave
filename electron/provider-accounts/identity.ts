import path from "node:path";
import type {
  ProviderAccountIdentity,
  ProviderAccountIdentityArgs,
} from "../../src/lib/providers/provider-account-identity";
import type { ProviderAccountProviderId } from "../../src/lib/providers/provider-accounts";
import {
  parseClaudeAuthStatus,
  parseCodexLoginStatus,
  readCodexIdentityClaims,
} from "./identity-parse";

type WithoutTime<T> = T extends unknown ? Omit<T, "checkedAt"> : never;
export type ProbedIdentity = WithoutTime<ProviderAccountIdentity>;

const PROBE_TIMEOUT_MS = 10_000;
const MAX_AUTH_FILE_BYTES = 256 * 1024;
const SIGNED_IN_TTL_MS = 10 * 60_000;
const OTHER_TTL_MS = 15_000;
const MAX_CONCURRENT_PROBES = 2;

export interface IdentityProbeDeps {
  /** Warm the executable lookup so the synchronous resolvers answer quickly. */
  prepare?: () => Promise<void>;
  /** The CLI to run, or "" when it was not found. */
  resolveExecutable: (args: { providerId: ProviderAccountProviderId; binaryPath?: string }) => string;
  /** The profile's own environment. May throw when the profile cannot be resolved. */
  buildEnv: (args: {
    providerId: ProviderAccountProviderId;
    profileId: string;
    executablePath: string;
  }) => Record<string, string | undefined>;
  run: (args: {
    executablePath: string;
    commandArgs: readonly string[];
    env: Record<string, string | undefined>;
    timeoutMs: number;
  }) => Promise<{ status: number | null; stdout: string; text: string; timedOut: boolean; error?: string }>;
  /** Text of a file, or a thrown error. Only ever called for a Codex `auth.json`. */
  readTextFile: (filePath: string, maxBytes: number) => Promise<string>;
  homeDirectory: () => string;
}

/**
 * One account's sign-in state, read the way the provider's own CLI reports it.
 * Claude answers with JSON; Codex answers only signed in or not, so for a
 * ChatGPT login the email and plan come from the profile's `auth.json`
 * (`readCodexIdentityClaims`). Errors become `unknown` and carry no detail.
 */
export async function probeProviderAccountIdentity(
  args: Pick<ProviderAccountIdentityArgs, "providerId" | "profileId" | "binaryPath">,
  deps: IdentityProbeDeps,
): Promise<ProbedIdentity> {
  try {
    await deps.prepare?.();
    const executablePath = deps.resolveExecutable({ providerId: args.providerId, binaryPath: args.binaryPath });
    if (!executablePath) return { state: "unknown", reason: "cli-missing" };
    const env = deps.buildEnv({ providerId: args.providerId, profileId: args.profileId, executablePath });
    const result = await deps.run({
      executablePath,
      commandArgs: args.providerId === "claude-code" ? ["auth", "status", "--json"] : ["login", "status"],
      env,
      timeoutMs: PROBE_TIMEOUT_MS,
    });
    if (result.timedOut || (result.error && result.status === null)) return { state: "unknown", reason: "failed" };

    if (args.providerId === "claude-code") {
      const parsed = parseClaudeAuthStatus(result.stdout);
      return parsed.state === "unreadable" ? { state: "unknown", reason: "unreadable" } : parsed;
    }

    const status = parseCodexLoginStatus({ status: result.status, text: result.text });
    if (status.state === "unreadable") return { state: "unknown", reason: "unreadable" };
    if (status.state === "signed-out") return status;
    // An API-key login has no identity, so its file is never opened.
    if (status.method === "api-key") return { state: "signed-in", email: null, plan: null };
    const home = env.CODEX_HOME?.trim() || path.join(deps.homeDirectory(), ".codex");
    try {
      const claims = readCodexIdentityClaims(await deps.readTextFile(path.join(home, "auth.json"), MAX_AUTH_FILE_BYTES));
      return { state: "signed-in", email: claims?.email ?? null, plan: claims?.plan ?? null };
    } catch {
      // A keyring login, or a file that cannot be read: signed in, identity unknown.
      return { state: "signed-in", email: null, plan: null };
    }
  } catch {
    return { state: "unknown", reason: "failed" };
  }
}

export function providerAccountIdentityKey(providerId: ProviderAccountProviderId, profileId: string) {
  return `${providerId}:${profileId}`;
}

/**
 * Remembers each account's last answer. A signed-in answer is kept for minutes
 * because it only changes when someone signs in or out, and the caller asks
 * again with `refresh` when that happens. Any other answer is kept for seconds
 * so a sign-in done in another terminal shows up on the next look. Repeat
 * calls share one probe; a `refresh` starts a new one and its answer wins.
 */
export class ProviderAccountIdentityCache {
  private readonly entries = new Map<string, { identity: ProviderAccountIdentity; expiresAt: number }>();
  private readonly pending = new Map<string, Promise<ProviderAccountIdentity>>();
  private readonly queue: Array<() => void> = [];
  private running = 0;

  constructor(
    private readonly probe: (
      args: Pick<ProviderAccountIdentityArgs, "providerId" | "profileId" | "binaryPath">,
    ) => Promise<ProbedIdentity>,
    private readonly now: () => number = Date.now,
  ) {}

  get(args: ProviderAccountIdentityArgs): Promise<ProviderAccountIdentity> {
    const key = providerAccountIdentityKey(args.providerId, args.profileId);
    if (!args.refresh) {
      const cached = this.entries.get(key);
      if (cached && cached.expiresAt > this.now()) return Promise.resolve(cached.identity);
      const inFlight = this.pending.get(key);
      if (inFlight) return inFlight;
    }
    const request: Promise<ProviderAccountIdentity> = this.schedule(() =>
      this.probe({ providerId: args.providerId, profileId: args.profileId, binaryPath: args.binaryPath }),
    ).then((probed) => {
      const identity = { ...probed, checkedAt: this.now() } as ProviderAccountIdentity;
      // Only the newest request for an account may write the cache.
      if (this.pending.get(key) === request) {
        this.entries.set(key, {
          identity,
          expiresAt: this.now() + (identity.state === "signed-in" ? SIGNED_IN_TTL_MS : OTHER_TTL_MS),
        });
      }
      return identity;
    }).finally(() => {
      if (this.pending.get(key) === request) this.pending.delete(key);
    });
    this.pending.set(key, request);
    return request;
  }

  /** Forget accounts that no longer exist. */
  retainOnly(keys: ReadonlySet<string>) {
    for (const key of [...this.entries.keys()]) if (!keys.has(key)) this.entries.delete(key);
  }

  private schedule<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        this.running += 1;
        task().then(resolve, reject).finally(() => {
          this.running -= 1;
          this.queue.shift()?.();
        });
      };
      if (this.running < MAX_CONCURRENT_PROBES) start();
      else this.queue.push(start);
    });
  }
}
