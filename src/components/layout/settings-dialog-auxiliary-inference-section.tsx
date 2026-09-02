import { useCallback } from "react";
import { ModelIcon } from "@/components/ai-elements/model-icon";
import { PromptModelField } from "@/components/layout/settings-dialog-model-fields";
import {
  ChoiceButtons,
  LabeledField,
  SectionStack,
  SettingsCard,
  SwitchField,
} from "@/components/layout/settings-dialog.shared";
import {
  AUX_LANES,
  DEFAULT_AUXILIARY_INFERENCE_POLICY,
  resolveAuxLaneRuntime,
  type AuxLane,
  type AuxLaneConfig,
  type AuxLaneProviderId,
} from "@/lib/providers/auxiliary-inference-policy";
import { useAppStore } from "@/store/app.store";

/**
 * Settings → Background AI.
 *
 * Every lane here is a model call Stave makes without the user asking for it.
 * Before this section they were invisible and unswitchable, which is how a
 * "cheap" background summary could quietly run on the user's most expensive
 * model. Each card exposes the three decisions that actually change spend:
 * whether the lane runs at all, which provider answers it, and which model.
 */

const LANE_COPY: Record<
  AuxLane,
  { title: string; description: string; modelDescription: string }
> = {
  intentGuard: {
    title: "Intent guard",
    description:
      "After a turn that changed files, compares the diff against the workspace's pinned intent anchors and badges the Changes panel. Runs only while an anchor is pinned.",
    modelDescription:
      "Model that judges the diff against the pinned intent. Empty follows the provider default.",
  },
  turnSummary: {
    title: "Turn summary",
    description:
      "Writes the short 'what was asked / what was done' line at the top of the Information panel after each completed turn.",
    modelDescription:
      "Preferred model for the latest-turn workspace summary.",
  },
  taskName: {
    title: "Task naming",
    description:
      "Suggests a task title from the opening prompts. Renaming a task by hand disables it for that task.",
    modelDescription: "Model that proposes the task title.",
  },
  utility: {
    title: "Utility inference",
    description:
      "Mechanical helper calls: route classification, commit messages, and prompt enhancement.",
    modelDescription: "Model used for mechanical utility calls.",
  },
  prDescription: {
    title: "PR description",
    description:
      "Drafts the pull request title and body from the branch diff. Off keeps Stave's non-AI fallback draft.",
    modelDescription: "Model that drafts the PR title and body.",
  },
  prePrReview: {
    title: "Pre-PR review",
    description:
      "One-shot review of the branch diff before Stave opens a pull request.",
    modelDescription:
      "Model that reviews the branch diff. Leave empty to use the provider's configured default.",
  },
  inlineCompletion: {
    title: "Inline completion",
    description:
      "Fill-in-the-middle code suggestions in the editor, requested on a keystroke debounce.",
    modelDescription: "Model that generates inline completions.",
  },
};

const PROVIDER_OPTIONS = [
  {
    value: "claude-code" as const,
    label: "Claude",
    description: "Run this lane on Claude.",
    icon: <ModelIcon providerId="claude-code" className="size-3.5" />,
  },
  {
    value: "codex" as const,
    label: "Codex",
    description: "Run this lane on Codex.",
    icon: <ModelIcon providerId="codex" className="size-3.5" />,
  },
];

function AuxLaneCard(args: { lane: AuxLane }) {
  // Row-local subscription: a lane card re-renders only when its own lane
  // changes, so editing one card does not re-render the others.
  const config = useAppStore(
    (state) =>
      state.settings.auxiliaryInferencePolicy[args.lane] ??
      DEFAULT_AUXILIARY_INFERENCE_POLICY[args.lane],
  );
  const policy = useAppStore((state) => state.settings.auxiliaryInferencePolicy);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const copy = LANE_COPY[args.lane];

  const patchLane = useCallback(
    (patch: Partial<AuxLaneConfig>) => {
      updateSettings({
        patch: {
          auxiliaryInferencePolicy: {
            ...policy,
            [args.lane]: { ...config, ...patch },
          },
        },
      });
    },
    [args.lane, config, policy, updateSettings],
  );

  const resolved = resolveAuxLaneRuntime({ lane: args.lane, policy });

  return (
    <SettingsCard title={copy.title} description={copy.description}>
      <SwitchField
        title={`Run ${copy.title.toLowerCase()}`}
        description={
          config.enabled
            ? "This lane makes a model call in the background."
            : "Off. No model call is made for this lane."
        }
        checked={config.enabled}
        onCheckedChange={(checked) => patchLane({ enabled: checked })}
      />
      {config.enabled ? (
        <>
          <LabeledField
            title="Provider"
            description={
              config.providerId
                ? "Pinned. This lane always runs on the selected provider."
                : "Not pinned: the lane follows the task's provider. Selecting one pins it."
            }
          >
            <ChoiceButtons<AuxLaneProviderId>
              // Only a pinned choice is shown as selected. Showing the resolved
              // fall-through here would claim a pin the user never made, and
              // contradict the field's own description.
              value={config.providerId ?? ("" as AuxLaneProviderId)}
              onChange={(providerId) => patchLane({ providerId })}
              options={PROVIDER_OPTIONS}
            />
          </LabeledField>
          <PromptModelField
            title="Model"
            description={
              config.model
                ? copy.modelDescription
                : `${copy.modelDescription} Currently using the default: ${resolved.model ?? "the provider's own choice"}.`
            }
            value={config.model ?? ""}
            onSelect={(model) => patchLane({ model })}
          />
          {config.fallbackModel !== undefined ? (
            <PromptModelField
              title="Fallback model"
              description="Tried once when the primary model is unavailable or its answer cannot be parsed."
              value={config.fallbackModel ?? ""}
              onSelect={(model) => patchLane({ fallbackModel: model })}
            />
          ) : null}
        </>
      ) : null}
    </SettingsCard>
  );
}

export function SettingsAuxiliaryInferenceSection() {
  return (
    <SectionStack>
      {AUX_LANES.map((lane) => (
        <AuxLaneCard key={lane} lane={lane} />
      ))}
    </SectionStack>
  );
}
