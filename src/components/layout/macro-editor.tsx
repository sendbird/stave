import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@/components/ui";
import { ModelIcon } from "@/components/ai-elements/model-icon";
import {
  getDefaultModelForProvider,
  getProviderLabel,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import {
  clampModelEffort,
  listModelEffortOptions,
  resolveDefaultModelEffort,
  type ModelEffort,
} from "@/lib/providers/model-effort";
import type { ManagedExecutionProviderId } from "@/lib/providers/provider.types";
import { listModelsForPresetProvider } from "@/lib/task-presets";
import {
  isMacroInstantRun,
  MACRO_INSERT_MODES,
  type Macro,
  type MacroInsertMode,
} from "@/lib/macros/types";
import {
  generateMacroId,
  normalizeMacro,
  slugifyMacroLabel,
} from "@/lib/macros/normalize";
import {
  ChoiceButtons,
  LabeledField,
  SelectField,
  SwitchField,
} from "./settings-dialog.shared";

const INSERT_MODE_OPTIONS: Array<{
  value: MacroInsertMode;
  label: string;
  description: string;
}> = [
  {
    value: "replace",
    label: "Replace",
    description: "Swap the current composer text for this prompt.",
  },
  {
    value: "append",
    label: "Append",
    description: "Add this prompt after the current composer text.",
  },
  {
    value: "prepend",
    label: "Prepend",
    description: "Add this prompt before the current composer text.",
  },
];

interface MacroEditorProps {
  initialMacro: Macro;
  submitLabel: string;
  error?: string;
  onSave: (macro: Macro) => { ok: boolean; error?: string };
  onCancel: () => void;
}

export function createEmptyMacroDraft(): Macro {
  const now = new Date().toISOString();
  return {
    id: generateMacroId(),
    label: "",
    slug: "",
    body: "",
    insertMode: "replace",
    createdAt: now,
    updatedAt: now,
  };
}

export function MacroEditor(props: MacroEditorProps) {
  const { initialMacro, submitLabel, error, onSave, onCancel } = props;
  const [label, setLabel] = useState(initialMacro.label);
  const [slug, setSlug] = useState(initialMacro.slug);
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState(
    initialMacro.description ?? "",
  );
  const [body, setBody] = useState(initialMacro.body);
  const [insertMode, setInsertMode] = useState<MacroInsertMode>(
    initialMacro.insertMode,
  );
  const [instantRun, setInstantRun] = useState(isMacroInstantRun(initialMacro));
  const [pinRuntime, setPinRuntime] = useState(Boolean(initialMacro.runtime));
  const [providerId, setProviderId] = useState<ManagedExecutionProviderId>(
    initialMacro.runtime?.providerId ?? "claude-code",
  );
  const [model, setModel] = useState(
    initialMacro.runtime?.model ??
      getDefaultModelForProvider({ providerId: "claude-code" }),
  );
  const [effort, setEffort] = useState<ModelEffort | "">(
    initialMacro.runtime?.effort ?? "",
  );
  const [localError, setLocalError] = useState<string | undefined>();

  useEffect(() => {
    setLabel(initialMacro.label);
    setSlug(initialMacro.slug);
    setSlugTouched(false);
    setDescription(initialMacro.description ?? "");
    setBody(initialMacro.body);
    setInsertMode(initialMacro.insertMode);
    setInstantRun(isMacroInstantRun(initialMacro));
    setPinRuntime(Boolean(initialMacro.runtime));
    setProviderId(initialMacro.runtime?.providerId ?? "claude-code");
    setModel(
      initialMacro.runtime?.model ??
        getDefaultModelForProvider({
          providerId: initialMacro.runtime?.providerId ?? "claude-code",
        }),
    );
    setEffort(initialMacro.runtime?.effort ?? "");
    setLocalError(undefined);
  }, [initialMacro]);

  const modelOptions = useMemo(
    () => listModelsForPresetProvider(providerId),
    [providerId],
  );
  const effortOptions = useMemo(
    () => listModelEffortOptions({ providerId, model }),
    [model, providerId],
  );

  function handleLabelChange(nextLabel: string) {
    setLabel(nextLabel);
    if (!slugTouched) {
      setSlug(slugifyMacroLabel(nextLabel));
    }
  }

  function handleProviderChange(nextProvider: string) {
    const nextProviderId = nextProvider === "codex" ? "codex" : "claude-code";
    setProviderId(nextProviderId);
    const nextModels = listModelsForPresetProvider(nextProviderId);
    const nextModel = nextModels.includes(model)
      ? model
      : getDefaultModelForProvider({ providerId: nextProviderId });
    setModel(nextModel);
    if (effort) {
      const nextEffort = clampModelEffort({
        providerId: nextProviderId,
        model: nextModel,
        effort,
        fallback: resolveDefaultModelEffort({
          providerId: nextProviderId,
          model: nextModel,
        }),
      });
      const supported = listModelEffortOptions({
        providerId: nextProviderId,
        model: nextModel,
      }).some((option) => option.value === nextEffort);
      setEffort(supported && nextEffort === effort ? effort : "");
    }
  }

  function handleModelChange(nextModel: string) {
    setModel(nextModel);
    if (!effort) {
      return;
    }
    const nextEffort = clampModelEffort({
      providerId,
      model: nextModel,
      effort,
      fallback: resolveDefaultModelEffort({ providerId, model: nextModel }),
    });
    const supported = listModelEffortOptions({
      providerId,
      model: nextModel,
    }).some((option) => option.value === nextEffort);
    if (!supported || nextEffort !== effort) {
      setEffort("");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeMacro({
      id: initialMacro.id,
      label,
      slug,
      description,
      body,
      insertMode,
      instantRun,
      runtime: pinRuntime
        ? {
            providerId,
            model,
            effort: effort || undefined,
          }
        : undefined,
      createdAt: initialMacro.createdAt,
      updatedAt: initialMacro.updatedAt,
    });
    if (!normalized) {
      setLocalError("Enter a label and a slug like conventional-commit.");
      return;
    }
    const result = onSave(normalized);
    if (!result.ok) {
      setLocalError(result.error);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <LabeledField
        title="Label"
        description="The name shown in Settings, the Macros control, and the left-wing quick picks."
        layout="stacked"
      >
        <Input
          id="macro-editor-label"
          value={label}
          onChange={(event) => handleLabelChange(event.target.value)}
          placeholder="Conventional commit"
          autoFocus
        />
      </LabeledField>
      <LabeledField
        title="Slug"
        description={`Type !${slug || "slug"} in the composer to insert this macro.`}
        layout="stacked"
      >
        <Input
          id="macro-editor-slug"
          value={slug}
          onChange={(event) => {
            setSlugTouched(true);
            setSlug(event.target.value);
          }}
          placeholder="conventional-commit"
        />
      </LabeledField>
      <LabeledField
        title="Description"
        description="Optional hint shown under the label in the composer picker."
        layout="stacked"
      >
        <Input
          id="macro-editor-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Write a conventional commit message"
        />
      </LabeledField>
      <LabeledField
        title="Prompt"
        description="The text inserted into the composer. Instant-run macros send this as soon as they are applied."
        layout="stacked"
      >
        <Textarea
          id="macro-editor-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Write a conventional commit message for the staged changes."
          className="min-h-28"
        />
      </LabeledField>
      <LabeledField
        title="Insert mode"
        description="Choose how this prompt combines with whatever is already in the composer."
        layout="stacked"
      >
        <ChoiceButtons
          value={insertMode}
          onChange={setInsertMode}
          columns={3}
          options={INSERT_MODE_OPTIONS}
          aria-label="Macro insert mode"
        />
      </LabeledField>
      <SwitchField
        title="Run immediately"
        description="Send the prompt as soon as this macro is applied, instead of leaving it in the composer to edit."
        checked={instantRun}
        onCheckedChange={setInstantRun}
      />
      <SwitchField
        title="Pin model"
        description="Override this turn's model and effort when the macro is applied."
        checked={pinRuntime}
        onCheckedChange={setPinRuntime}
      />
      {pinRuntime ? (
        <>
          <SelectField
            title="Provider"
            description="The execution provider used for this macro's pinned model."
            value={providerId}
            onChange={handleProviderChange}
            options={(["claude-code", "codex"] as const).map((id) => ({
              value: id,
              label: getProviderLabel({ providerId: id }),
            }))}
          />
          <LabeledField
            title="Model"
            description="The model used when this macro is applied."
          >
            <Select value={model} onValueChange={handleModelChange}>
              <SelectTrigger className="h-10 w-full rounded-md border-border/75 bg-background text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {modelOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    <span className="flex min-w-0 items-center gap-2">
                      <ModelIcon
                        providerId={providerId}
                        model={option}
                        className="size-3.5"
                      />
                      <span className="truncate">
                        {toHumanModelName({ model: option })}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabeledField>
          <SelectField
            title="Effort"
            description="Leave on the model default, or pin an effort for this macro."
            value={effort || "__default__"}
            onChange={(value) =>
              setEffort(value === "__default__" ? "" : (value as ModelEffort))
            }
            options={[
              { value: "__default__", label: "Default (per model)" },
              ...effortOptions.map((option) => ({
                value: option.value,
                label: option.label,
              })),
            ]}
          />
        </>
      ) : null}
      {localError || error ? (
        <p className="text-sm text-destructive">{localError ?? error}</p>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
