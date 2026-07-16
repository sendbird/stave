import { resolveCommandCwd, runCommandArgs } from "../main/utils/command";

const GH_AUTH_SUCCESS_TTL_MS = 5 * 60_000;
const GH_AUTH_FAILURE_TTL_MS = 20_000;

type GhAuthResult = Awaited<ReturnType<typeof runCommandArgs>>;

const authCache = new Map<
  string,
  { expiresAt: number; result: GhAuthResult }
>();

export async function ensureGhAuth(args: {
  cwd?: string;
  now?: () => number;
  runCommand?: typeof runCommandArgs;
}) {
  const now = args.now?.() ?? Date.now();
  const cacheKey = resolveCommandCwd({ cwd: args.cwd });
  const cached = authCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.result;
  }

  const result = await (args.runCommand ?? runCommandArgs)({
    command: "gh",
    commandArgs: ["auth", "status"],
    cwd: args.cwd,
  });
  authCache.set(cacheKey, {
    expiresAt:
      now + (result.ok ? GH_AUTH_SUCCESS_TTL_MS : GH_AUTH_FAILURE_TTL_MS),
    result,
  });
  return result;
}

export function invalidateGhAuthCache(args?: { cwd?: string }) {
  if (!args) {
    authCache.clear();
    return;
  }
  authCache.delete(resolveCommandCwd({ cwd: args.cwd }));
}
