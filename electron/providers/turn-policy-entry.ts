import { resolveTurnPolicy, type TurnPolicy } from "../../src/lib/policy/turn-policy";
import type { StreamTurnArgs } from "./types";

/**
 * The host turn entry's one policy step. Every turn that reaches a provider
 * gets its autonomy here: a main Agent's comes from its assignment, every
 * other turn's from the options it carries (the user's settings, a
 * delegation's resolved policy, or the user's synced settings for a turn
 * Stave started). Secondary read-only runs keep their own fixed posture, and
 * a caller-supplied `turnPolicy` never survives this step.
 */
export function applyTurnPolicy<T extends StreamTurnArgs>(args: T, agentPolicy?: TurnPolicy): T {
  if (args.executionPolicy || !args.cwd) return { ...args, turnPolicy: undefined };
  const policy = agentPolicy ?? resolveTurnPolicy({
    providerId: args.providerId, actor: { kind: "chat" }, options: args.runtimeOptions, root: args.cwd,
  });
  return { ...args, runtimeOptions: { ...args.runtimeOptions, ...policy.options }, turnPolicy: policy };
}
