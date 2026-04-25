import { useEffect, useMemo, useState } from "react";
import { RefreshCcw } from "lucide-react";
import {
  buildModelSelectorOptions,
  buildModelSelectorValue,
  buildRecommendedModelSelectorOptions,
  ModelSelector,
} from "@/components/ai-elements/model-selector";
import { Button, Textarea } from "@/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCodexModelCatalog } from "@/lib/providers/use-codex-model-catalog";
import {
  DEFAULT_STAVE_MUSE_CHAT_PROMPT,
  DEFAULT_STAVE_MUSE_PLANNER_PROMPT,
  DEFAULT_STAVE_MUSE_ROUTER_PROMPT,
} from "@/lib/stave-muse-prompts";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import { useShallow } from "zustand/react/shallow";
import {
  LabeledField,
  SectionHeading,
  SectionStack,
  SettingsCard,
  SwitchField,
} from "./settings-dialog.shared";

const MUSE_MODEL_PROVIDER_IDS = ["claude-code", "codex"] as const;

function MuseModelField(args: {
  title: string;
  description: string;
  value: string;
  options: ReturnType<typeof buildModelSelectorOptions>;
  recommendedOptions: ReturnType<typeof buildRecommendedModelSelectorOptions>;
  onSelect: (model: string) => void;
}) {
  return (
    <LabeledField title={args.title} description={args.description}>
      <ModelSelector
        value={buildModelSelectorValue({ model: args.value })}
        options={args.options}
        recommendedOptions={args.recommendedOptions}
        className="w-full"
        triggerClassName="h-10 w-full max-w-none rounded-md border border-border/80 bg-background px-3 hover:bg-muted/40"
        menuClassName="sm:max-w-lg"
        onSelect={({ selection }) => args.onSelect(selection.model)}
      />
    </LabeledField>
  );
}

function MusePromptField(args: {
  title: string;
  description: string;
  value: string;
  defaultValue: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(args.value);
  const isDefault = draft === args.defaultValue;

  useEffect(() => {
    setDraft(args.value);
  }, [args.value]);

  return (
    <LabeledField title={args.title} description={args.description}>
      <Textarea
        className="min-h-[120px] resize-y font-mono text-xs leading-relaxed"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== args.value) {
            args.onCommit(draft);
          }
        }}
      />
      <div className="flex items-center justify-between">
        <p
          className={cn(
            "text-xs",
            isDefault ? "text-muted-foreground" : "text-primary",
          )}
        >
          {isDefault ? "Using default" : "Customised"}
        </p>
        {!isDefault ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              setDraft(args.defaultValue);
              args.onCommit(args.defaultValue);
            }}
          >
            <RefreshCcw className="size-3" />
            Reset to default
          </Button>
        ) : null}
      </div>
    </LabeledField>
  );
}

export function MuseSection() {
  const codexBinaryPath = useAppStore(
    (state) => state.settings.codexBinaryPath,
  );
  const [
    museDefaultTarget,
    museRouterModel,
    museChatModel,
    musePlannerModel,
    museRouterPrompt,
    museChatPrompt,
    musePlannerPrompt,
    museAutoHandoffToTask,
    museAllowDirectWorkspaceInfoEdits,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.museDefaultTarget,
          state.settings.museRouterModel,
          state.settings.museChatModel,
          state.settings.musePlannerModel,
          state.settings.museRouterPrompt,
          state.settings.museChatPrompt,
          state.settings.musePlannerPrompt,
          state.settings.museAutoHandoffToTask,
          state.settings.museAllowDirectWorkspaceInfoEdits,
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const codexModelCatalog = useCodexModelCatalog({
    enabled: true,
    codexBinaryPath,
  });
  const codexModelEnrichmentForMuse = useMemo(() => {
    if (codexModelCatalog.entries.length === 0) {
      return undefined;
    }
    const map = new Map<
      string,
      { description?: string; isDefault?: boolean }
    >();
    for (const entry of codexModelCatalog.entries) {
      const id = entry.model.trim();
      if (id) {
        map.set(id, {
          description: entry.description || undefined,
          isDefault: entry.isDefault || undefined,
        });
      }
    }
    return map.size > 0 ? map : undefined;
  }, [codexModelCatalog.entries]);
  const museRoleModelOptions = useMemo(
    () =>
      buildModelSelectorOptions({
        providerIds: MUSE_MODEL_PROVIDER_IDS,
        modelsByProvider: {
          codex: codexModelCatalog.models,
        },
        enrichmentByModel: codexModelEnrichmentForMuse,
      }),
    [codexModelCatalog.models, codexModelEnrichmentForMuse],
  );
  const museRecommendedModelOptions = useMemo(
    () =>
      buildRecommendedModelSelectorOptions({ options: museRoleModelOptions }),
    [museRoleModelOptions],
  );

  return (
    <SectionStack>
      <SectionHeading
        title="Stave Muse"
        description="Configure the app-wide Muse that navigates Stave, orchestrates connected-tool workflows for the user's project, updates the Information panel, and hands Stave implementation work off into task chat."
      />

      <SettingsCard
        title="Behavior"
        description="These defaults affect the floating Stave Muse widget and any Muse commands routed through it."
      >
        <LabeledField
          title="Default Target"
          description="Choose the default scope for new Muse conversations."
        >
          <Select
            value={museDefaultTarget}
            onValueChange={(value) =>
              updateSettings({
                patch: {
                  museDefaultTarget: value as
                    | "app"
                    | "current-project"
                    | "current-workspace",
                },
              })
            }
          >
            <SelectTrigger className="h-10 rounded-md border-border/80 bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="app">App</SelectItem>
              <SelectItem value="current-project">Current Project</SelectItem>
              <SelectItem value="current-workspace">
                Current Workspace
              </SelectItem>
            </SelectContent>
          </Select>
        </LabeledField>

        <SwitchField
          title="Auto Handoff To Task"
          description="When Muse detects Stave implementation or repository work that belongs in a workspace task, automatically create a task and continue there."
          checked={museAutoHandoffToTask}
          onCheckedChange={(checked) =>
            updateSettings({ patch: { museAutoHandoffToTask: checked } })
          }
        />

        <SwitchField
          title="Direct Information Edits"
          description="Allow Muse to update notes, todos, links, and custom fields in the Information panel without creating a task."
          checked={museAllowDirectWorkspaceInfoEdits}
          onCheckedChange={(checked) =>
            updateSettings({
              patch: { museAllowDirectWorkspaceInfoEdits: checked },
            })
          }
        />
      </SettingsCard>

      <SettingsCard
        title="Model Routing"
        description="Separate routing, chat, and planning roles so Muse stays fast for app control while still handling heavier reasoning when needed."
      >
        <MuseModelField
          title="Router Model"
          description="Lightweight classifier used to decide between direct chat, Muse planning, and task handoff."
          value={museRouterModel}
          options={museRoleModelOptions}
          recommendedOptions={museRecommendedModelOptions}
          onSelect={(model) =>
            updateSettings({ patch: { museRouterModel: model } })
          }
        />
        <MuseModelField
          title="Chat Model"
          description="Used for Stave questions, Information panel actions, and connected-tool workflows that stay inside the Muse widget."
          value={museChatModel}
          options={museRoleModelOptions}
          recommendedOptions={museRecommendedModelOptions}
          onSelect={(model) =>
            updateSettings({ patch: { museChatModel: model } })
          }
        />
        <MuseModelField
          title="Planner Model"
          description="Used for structured workflow planning, configuration strategy, and multi-step reasoning that should not enter task chat yet."
          value={musePlannerModel}
          options={museRoleModelOptions}
          recommendedOptions={museRecommendedModelOptions}
          onSelect={(model) =>
            updateSettings({ patch: { musePlannerModel: model } })
          }
        />
      </SettingsCard>

      <SettingsCard
        title="Prompts"
        description="Customise the instruction blocks Muse uses for routing and for chat/planner turns. Muse guardrails, context, and user input are appended automatically."
      >
        <MusePromptField
          title="Router Prompt"
          description="Instruction block for classifying Muse requests into chat, planner, or handoff on top of the built-in Muse guardrails."
          value={museRouterPrompt}
          defaultValue={DEFAULT_STAVE_MUSE_ROUTER_PROMPT}
          onCommit={(value) =>
            updateSettings({ patch: { museRouterPrompt: value } })
          }
        />
        <MusePromptField
          title="Chat Prompt"
          description="Injected into normal Muse chat turns after the built-in Muse guardrails."
          value={museChatPrompt}
          defaultValue={DEFAULT_STAVE_MUSE_CHAT_PROMPT}
          onCommit={(value) =>
            updateSettings({ patch: { museChatPrompt: value } })
          }
        />
        <MusePromptField
          title="Planner Prompt"
          description="Injected into Muse planner turns after the built-in Muse guardrails."
          value={musePlannerPrompt}
          defaultValue={DEFAULT_STAVE_MUSE_PLANNER_PROMPT}
          onCommit={(value) =>
            updateSettings({ patch: { musePlannerPrompt: value } })
          }
        />
      </SettingsCard>
    </SectionStack>
  );
}
