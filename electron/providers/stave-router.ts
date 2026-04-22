/**
 * Stave Auto fallback router.
 *
 * Primary routing should come from the LLM preprocessor. This module exists as a
 * deterministic fallback when the preprocessor is unavailable or returns invalid
 * output. It classifies the prompt into an intent, then resolves the configured
 * model for that intent from the Stave Auto profile.
 */

import type { StreamTurnArgs } from "./types";
import type { CanonicalConversationRequest, StaveAutoIntent, StaveAutoProfile } from "../../src/lib/providers/provider.types";
import type { SkillCatalogProvider } from "../../src/lib/skills/types";
import {
  DEFAULT_STAVE_AUTO_PROFILE,
  resolveStaveIntentModel,
  resolveStaveProviderForModel,
} from "../../src/lib/providers/stave-auto-profile";

export type StaveRouteTarget = {
  providerId: "claude-code" | "codex";
  model: string;
  reason: string;
};

type BuildStaveResolvedArgsOptions = {
  forceCodexPlanMode?: boolean;
};

const PLAN_PATTERNS: RegExp[] = [
  /\b(plan|approach|strategy|before\s+implement|how\s+should\s+i\s+(approach|structure))\b/i,
  /(설계|계획|전략|어떻게\s*할까|방향|구조\s*설계)/,
];

const ANALYZE_PATTERNS: RegExp[] = [
  /\b(analyze|analysis|explain|why|debug|review|root\s*cause|architecture|overview|summary|understand)\b/i,
  /(분석|설명|왜|디버그|리뷰|원인|이해|요약|전체)/,
];

const QUICK_EDIT_PATTERNS: RegExp[] = [
  /\b(rename|typo|quick\s+(fix|change|edit)|small\s+(fix|change)|just\s+(fix|change|update|remove))\b/i,
  /(이름\s*변경|오타|간단(히|하게)|수정만)/,
];

const IMPLEMENT_PATTERNS: RegExp[] = [
  /\b(implement|build|write|generate|create|refactor|fix|patch|add\s+tests?|write\s+tests?)\b/i,
  /(구현|작성|생성|리팩터링|수정|패치|테스트\s*추가)/,
];

function countMatches(patterns: RegExp[], text: string): number {
  return patterns.filter((re) => re.test(text)).length;
}

export function resolveStaveIntent(args: {
  prompt: string;
  attachedFileCount?: number;
  historyLength?: number;
}): StaveAutoIntent {
  const { prompt, attachedFileCount = 0, historyLength = 0 } = args;
  const len = prompt.length;

  const planScore = countMatches(PLAN_PATTERNS, prompt);
  const analyzeScore = countMatches(ANALYZE_PATTERNS, prompt);
  const quickEditScore = countMatches(QUICK_EDIT_PATTERNS, prompt);
  const implementScore = countMatches(IMPLEMENT_PATTERNS, prompt);

  const isShort = len < 350;

  if (planScore >= 1 && analyzeScore === 0 && len > 3) {
    return "plan";
  }

  if (quickEditScore >= 1 && isShort) {
    return "quick_edit";
  }

  if (analyzeScore >= 1) {
    return "analyze";
  }

  if (implementScore >= 1) {
    return "implement";
  }

  return "general";
}

export function resolveStaveTarget(args: {
  prompt: string;
  attachedFileCount?: number;
  historyLength?: number;
  profile?: StaveAutoProfile;
}): StaveRouteTarget {
  const profile = args.profile ?? DEFAULT_STAVE_AUTO_PROFILE;
  const intent = resolveStaveIntent({
    prompt: args.prompt,
    attachedFileCount: args.attachedFileCount,
    historyLength: args.historyLength,
  });
  const model = resolveStaveIntentModel({ profile, intent });

  const reasons: Record<StaveAutoIntent, string> = {
    plan: `Planning intent -> ${model}`,
    analyze: `Analysis intent -> ${model}`,
    implement: `Implementation intent -> ${model}`,
    quick_edit: `Quick edit intent -> ${model}`,
    general: `General task -> ${model}`,
  };

  return {
    providerId: resolveStaveProviderForModel({ model }),
    model,
    reason: reasons[intent],
  };
}

export function resolveForcedStavePlanTarget(args: {
  profile: StaveAutoProfile;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): StaveRouteTarget | null {
  if (args.runtimeOptions?.claudePermissionMode !== "plan") {
    return null;
  }

  const model = args.profile.planModel;
  return {
    providerId: resolveStaveProviderForModel({ model }),
    model,
    reason: `Plan mode forced -> ${model}`,
  };
}

/**
 * Skill fast-path: when the request contains skill_context in contextParts,
 * bypass the preprocessor entirely and route directly to the appropriate model
 * based on the skill's declared provider.
 *
 * Returns `null` when no skill context is present (normal preprocessor flow).
 */
export function resolveSkillFastPath(args: {
  contextParts: CanonicalConversationRequest["contextParts"];
  profile: StaveAutoProfile;
}): StaveRouteTarget | null {
  const skillPart = args.contextParts.find(
    (p): p is Extract<typeof p, { type: "skill_context" }> =>
      p.type === "skill_context",
  );
  if (!skillPart || skillPart.skills.length === 0) {
    return null;
  }

  const skills = skillPart.skills;
  const skillNames = skills.map((s) => s.name).join(", ");

  // Determine the dominant provider across all skills.
  // If all skills share the same concrete provider, use it. Otherwise fall back to "shared".
  const providers = new Set<SkillCatalogProvider>(skills.map((s) => s.provider));
  // Normalize: "stave" is not a concrete executor, treat it as "shared".
  if (providers.has("stave")) {
    providers.delete("stave");
    providers.add("shared");
  }
  // If after normalization there is exactly one non-"shared" provider, use it.
  const concreteProviders = new Set([...providers].filter((p) => p !== "shared"));
  const dominantProvider: SkillCatalogProvider =
    concreteProviders.size === 1
      ? [...concreteProviders][0]
      : "shared";

  // Resolve model from the profile based on the dominant provider.
  let model: string;
  if (dominantProvider === "codex") {
    model = args.profile.implementModel;
  } else if (dominantProvider === "claude-code") {
    model = args.profile.generalModel;
  } else {
    // "shared" — use the profile's general-purpose model.
    model = args.profile.generalModel;
  }

  return {
    providerId: resolveStaveProviderForModel({ model }),
    model,
    reason: `Skill fast-path → ${skillNames}`,
  };
}

export function buildStaveResolvedArgs(
  args: StreamTurnArgs,
  target: StaveRouteTarget,
  options: BuildStaveResolvedArgsOptions = {},
): StreamTurnArgs {
  const resolvedConversation = args.conversation
    ? {
        ...args.conversation,
        target: {
          providerId: target.providerId,
          model: target.model,
        },
      }
    : undefined;

  return {
    ...args,
    providerId: target.providerId,
    runtimeOptions: {
      ...args.runtimeOptions,
      model: target.model,
      ...(options.forceCodexPlanMode && target.providerId === "codex"
        ? { codexPlanMode: true }
        : {}),
    },
    ...(resolvedConversation !== undefined ? { conversation: resolvedConversation } : {}),
  };
}
