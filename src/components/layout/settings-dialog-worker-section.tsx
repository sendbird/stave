import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui";
import { ModelIcon } from "@/components/ai-elements/model-icon";
import {
  LabeledField,
  SettingsCard,
  SwitchField,
} from "@/components/layout/settings-dialog.shared";
import {
  buildWorkerEffortOptions,
  buildWorkerModelOptions,
  buildWorkerPresetOptions,
} from "@/components/ai-elements/prompt-input-worker-mode.utils";
import {
  DEFAULT_WORKER_PRESET_ID,
  WORKER_AUTO_VALUE,
  WORKER_DESCRIPTION_MAX_CHARS,
  WORKER_INSTRUCTIONS_MAX_CHARS,
  WORKER_TURNS_MAX,
  WORKER_TURNS_MIN,
  type WorkerEffortPreference,
  type WorkerPresetId,
  type WorkerProviderConfig,
  getWorkerPreset,
  listWorkerPrimaryModels,
  resolveWorkerProfile,
  workerToolsEnforced,
} from "@/lib/providers/worker-mode";
import {
  getProviderLabel,
  listProviderIds,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";

/**
 * Per-provider Worker mode defaults.
 *
 * Provider-tabbed rather than one flat form because almost nothing is shared:
 * the two providers have different worker models, different effort scales, and
 * different enforcement guarantees for the preset's tool list. Presenting them
 * together would imply a symmetry the runtimes do not have.
 *
 * Description and instructions are editable per provider. Empty means "use the
 * preset", which is what keeps a preset improvement from being shadowed by a
 * stale copy of its previous text.
 */
export function SettingsWorkerSection(args: {
  workerEnabled: boolean;
  workerConfigByProvider: Partial<Record<ProviderId, WorkerProviderConfig>>;
  onChange: (args: {
    workerEnabled?: boolean;
    workerConfigByProvider?: Partial<Record<ProviderId, WorkerProviderConfig>>;
  }) => void;
}) {
  const providerIds = listProviderIds();
  const [activeProviderId, setActiveProviderId] = useState<ProviderId>(
    providerIds[0] ?? "claude-code",
  );

  const patchProvider = (
    providerId: ProviderId,
    patch: Partial<WorkerProviderConfig>,
  ) => {
    args.onChange({
      workerConfigByProvider: {
        ...args.workerConfigByProvider,
        [providerId]: {
          ...(args.workerConfigByProvider[providerId] ?? {}),
          ...patch,
        },
      },
    });
  };

  return (
    <SettingsCard
      id="settings-field-worker"
      tabIndex={-1}
      title="Worker mode"
      description="Let a high-tier primary delegate bounded implementation work to a cheaper same-provider worker, then review and integrate the result."
      titleAccessory={
        <Badge variant={args.workerEnabled ? "secondary" : "outline"}>
          {args.workerEnabled ? "On by default" : "Off by default"}
        </Badge>
      }
    >
      <SwitchField
        title="Arm Worker mode by default"
        description="New tasks start with Worker mode on. Each task's composer can still turn it off, and the choice is remembered per provider."
        checked={args.workerEnabled}
        onCheckedChange={(checked) => args.onChange({ workerEnabled: checked })}
      />

      <Tabs
        value={activeProviderId}
        onValueChange={(value) => setActiveProviderId(value as ProviderId)}
      >
        <TabsList>
          {providerIds.map((providerId) => (
            <TabsTrigger key={providerId} value={providerId}>
              <ModelIcon providerId={providerId} className="size-3.5" />
              {getProviderLabel({ providerId })}
            </TabsTrigger>
          ))}
        </TabsList>
        {providerIds.map((providerId) => (
          <TabsContent key={providerId} value={providerId} className="space-y-5">
            <WorkerProviderForm
              providerId={providerId}
              config={args.workerConfigByProvider[providerId] ?? {}}
              onPatch={(patch) => patchProvider(providerId, patch)}
            />
          </TabsContent>
        ))}
      </Tabs>
    </SettingsCard>
  );
}

function WorkerProviderForm(args: {
  providerId: ProviderId;
  config: WorkerProviderConfig;
  onPatch: (patch: Partial<WorkerProviderConfig>) => void;
}) {
  const presetId = args.config.presetId ?? DEFAULT_WORKER_PRESET_ID;
  const preset = getWorkerPreset(presetId);
  const requestedModel = args.config.model ?? WORKER_AUTO_VALUE;
  const primaryModels = listWorkerPrimaryModels(args.providerId);
  // Previewed against a supported primary so the preview reports the worker the
  // preset would actually resolve to, rather than "unavailable" just because the
  // Settings pane has no active task.
  const previewPrimary = primaryModels[0] ?? "";
  const preview = resolveWorkerProfile({
    providerId: args.providerId,
    primaryModel: previewPrimary,
    intent: {
      mode: "task-executor",
      presetId,
      workerModel: requestedModel,
      workerEffort: args.config.effort ?? WORKER_AUTO_VALUE,
      ...(args.config.description
        ? { description: args.config.description }
        : {}),
      ...(args.config.instructions
        ? { instructions: args.config.instructions }
        : {}),
      ...(args.config.maxTurns !== undefined
        ? { maxTurns: args.config.maxTurns }
        : {}),
    },
  });
  const effectiveWorkerModel =
    preview.status === "ready"
      ? preview.profile.resolvedWorkerModel
      : preset.autoModel[args.providerId];
  const effortOptions = buildWorkerEffortOptions({
    providerId: args.providerId,
    workerModel: effectiveWorkerModel,
    presetId,
  });

  return (
    <>
      <LabeledField
        title="Preset"
        description="Sets the worker's role, its default model and effort, and the tool bounds it is given."
      >
        <Select
          value={presetId}
          onValueChange={(value) =>
            // Same reset as the composer: keeping hand-edited copy across a
            // preset switch would silently shadow the new preset's text.
            args.onPatch({
              presetId: value as WorkerPresetId,
              description: undefined,
              instructions: undefined,
              tools: undefined,
              maxTurns: undefined,
            })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {buildWorkerPresetOptions().map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label} — {option.summary}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </LabeledField>

      <LabeledField
        title="Worker model"
        description="Auto follows the preset's recommendation for this provider."
      >
        <Select
          value={requestedModel}
          onValueChange={(value) => args.onPatch({ model: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {buildWorkerModelOptions({
              providerId: args.providerId,
              presetId,
            }).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
                {option.description ? ` — ${option.description}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </LabeledField>

      {effortOptions.length > 0 ? (
        <LabeledField
          title="Worker effort"
          description="A cheap worker at high effort often beats a mid-tier worker at its default."
        >
          <Select
            value={args.config.effort ?? WORKER_AUTO_VALUE}
            onValueChange={(value) =>
              args.onPatch({ effort: value as WorkerEffortPreference })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {effortOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label} — {option.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </LabeledField>
      ) : (
        <p className="text-xs leading-5 text-muted-foreground">
          {toHumanModelName({ model: effectiveWorkerModel })} has no selectable
          reasoning effort; it runs at its own default.
        </p>
      )}

      <LabeledField
        title="Delegation description"
        description={
          args.providerId === "claude-code"
            ? "What the primary reads to decide whether to delegate. Write it as a trigger. Empty uses the preset's text."
            : "Describes the worker's role in the primary's developer instructions. Empty uses the preset's text."
        }
      >
        <div className="space-y-1.5">
          <Textarea
            value={args.config.description ?? ""}
            placeholder={preset.description}
            maxLength={WORKER_DESCRIPTION_MAX_CHARS}
            rows={3}
            onChange={(event) =>
              args.onPatch({
                description: event.target.value.trim()
                  ? event.target.value
                  : undefined,
              })
            }
          />
          {args.config.description ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => args.onPatch({ description: undefined })}
            >
              <RotateCcw className="size-3.5" />
              Reset to preset
            </Button>
          ) : null}
        </div>
      </LabeledField>

      <LabeledField
        title="Worker instructions"
        description="The worker's system prompt. It starts with no view of the conversation, so this has to stand alone. Empty uses the preset's text."
      >
        <div className="space-y-1.5">
          <Textarea
            value={args.config.instructions ?? ""}
            placeholder={preset.instructions}
            maxLength={WORKER_INSTRUCTIONS_MAX_CHARS}
            rows={8}
            className="font-mono text-xs"
            onChange={(event) =>
              args.onPatch({
                instructions: event.target.value.trim()
                  ? event.target.value
                  : undefined,
              })
            }
          />
          {args.config.instructions ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => args.onPatch({ instructions: undefined })}
            >
              <RotateCcw className="size-3.5" />
              Reset to preset
            </Button>
          ) : null}
        </div>
      </LabeledField>

      <LabeledField
        title="Max worker turns"
        description={`Caps the worker's agentic round-trips. Empty uses the preset's value (${preset.maxTurns ?? "unset"}).`}
      >
        <input
          type="number"
          inputMode="numeric"
          min={WORKER_TURNS_MIN}
          max={WORKER_TURNS_MAX}
          value={args.config.maxTurns ?? ""}
          placeholder={String(preset.maxTurns ?? "")}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onChange={(event) => {
            const parsed = Number.parseInt(event.target.value, 10);
            args.onPatch({
              maxTurns: Number.isFinite(parsed) ? parsed : undefined,
            });
          }}
        />
      </LabeledField>

      <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
        <p className="font-medium text-foreground">
          {preview.status === "ready"
            ? `${toHumanModelName({ model: previewPrimary })} → ${toHumanModelName(
                { model: preview.profile.resolvedWorkerModel },
              )}${
                preview.profile.resolvedWorkerEffort
                  ? ` · ${preview.profile.resolvedWorkerEffort}`
                  : ""
              }`
            : "Worker mode cannot run with this configuration"}
        </p>
        {preview.status === "unavailable" ? (
          <p className="mt-1 text-warning">{preview.detail}</p>
        ) : null}
        {preview.status === "ready" && preview.profile.costWarning ? (
          <p className="mt-1 text-warning">{preview.profile.costWarning}</p>
        ) : null}
        <p className="mt-1">
          Orchestrating primaries on this provider:{" "}
          {primaryModels.map((model) => toHumanModelName({ model })).join(", ")}.
          Other primaries show Worker mode as unavailable instead of silently
          running solo.
        </p>
        {preview.status === "ready" && preview.profile.tools ? (
          <p className="mt-1">
            Tools: {preview.profile.tools.join(", ")}
            {workerToolsEnforced(args.providerId)
              ? "."
              : " — passed as guidance, since Codex cannot hard-limit a worker's tools."}
          </p>
        ) : null}
        <p className="mt-1">
          One foreground worker runs at a time. It inherits this turn&apos;s
          sandbox and approval policy, so a plan or read-only turn cannot gain
          write access by delegating.
        </p>
      </div>
    </>
  );
}
