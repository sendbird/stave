import { expect, test } from "bun:test";
import { defaultSettings } from "../src/store/app-settings";
import { resolveDelegatedRuntimeOverrides } from "../src/store/auto-routing-dispatch";
import {
  buildStarterProfile,
  type AutoRoutingProfile,
} from "../src/lib/providers/auto-routing-profile";

const starter = buildStarterProfile("starter-balanced");
const profile: AutoRoutingProfile = {
  ...starter,
  rules: [
    {
      id: "sensitive-advisor",
      enabled: true,
      when: { role: "advisor", sensitive: true },
      then: { providerId: "codex", model: "gpt-6-astra", effort: "high" },
      reason: "Sensitive changes need deeper review",
    },
    {
      id: "complex-advisor",
      enabled: true,
      when: { role: "advisor", complexity: "high" },
      then: { providerId: "codex", model: "gpt-6-astra", effort: "xhigh" },
      reason: "Broad context",
    },
    {
      id: "review-advisor",
      enabled: true,
      when: { role: "advisor", taskClass: "review" },
      then: { providerId: "codex", model: "gpt-5.6-sol", effort: "high" },
      reason: "Review request",
    },
    ...starter.rules,
  ],
};

function route(prompt: string, fileContextCount = 0, pinned = false) {
  return resolveDelegatedRuntimeOverrides({
    state: {
      settings: {
        ...defaultSettings,
        autoRoutingEnabled: false,
        autoRoutingProfile: profile,
        advisorTarget: { providerId: "codex", model: "auto" },
      },
      rateLimitsSnapshot: null,
      providerAvailability: {
        "claude-code": true,
        codex: true,
        cursor: false,
        kiro: false,
      },
    },
    overrides: pinned
      ? {
          advisorTarget: {
            providerId: "codex",
            model: "gpt-5.6-sol",
            effort: "medium",
          },
        }
      : undefined,
    provider: "claude-code",
    activeModel: "claude-opus-5",
    prompt,
    fileContextCount,
  })?.advisorTarget;
}

test("Advisor Auto uses request signals even with a manually selected primary", () => {
  expect(route("Review the authentication migration")).toMatchObject({
    model: "gpt-6-astra",
    effort: "high",
  });
  expect(route("Review the layout")).toMatchObject({
    model: "gpt-6-sol",
    effort: "high",
  });
  expect(route("Implement this feature", 5)).toMatchObject({
    model: "gpt-6-astra",
    effort: "xhigh",
  });
  expect(route("Fix typo")).toMatchObject({
    model: "gpt-6-astra",
    effort: "medium",
  });
});

test("explicit Advisor selection remains pinned for sensitive requests", () => {
  expect(route("Review the authentication migration", 5, true)).toEqual({
    providerId: "codex",
    model: "gpt-5.6-sol",
    effort: "medium",
  });
});
