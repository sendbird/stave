import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
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
  MACRO_INSERT_MODES,
  type Macro,
  type MacroInsertMode,
} from "@/lib/macros/types";
import {
  generateMacroId,
  normalizeMacro,
  slugifyMacroLabel,
} from "@/lib/macros/normalize";
import { ChoiceButtons } from "./settings-dialog.shared";

const INSERT_MODE_LABELS: Record<MacroInsertMode, string> = {
  replace: "Replace",
  append: "Append",
  prepend: "Prepend",
};

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
    const nextProviderId =
      nextProvider === "codex" ? "codex" : "claude-code";
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
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1">
        <label
          htmlFor="macro-editor-label"
          className="text-xs font-medium text-muted-foreground"
        >
          Label
        </label>
        <Input
          id="macro-editor-label"
          value={label}
          onChange={(event) => handleLabelChange(event.target.value)}
          placeholder="Conventional commit"
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-1">
        <label
          htmlFor="macro-editor-slug"
          className="text-xs font-medium text-muted-foreground"
        >
          Slug
        </label>
        <Input
          id="macro-editor-slug"
          value={slug}
          onChange={(event) => {
            setSlugTouched(true);
            setSlug(event.target.value);
          }}
          placeholder="conventional-commit"
        />
        <p className="text-[11px] text-muted-foreground">
          Type <span className="font-medium text-foreground">!{slug || "slug"}</span>{" "}
          in the composer to insert this macro.
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <label
          htmlFor="macro-editor-description"
          className="text-xs font-medium text-muted-foreground"
        >
          Description
        </label>
        <Input
          id="macro-editor-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Write a conventional commit message"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label
          htmlFor="macro-editor-body"
          className="text-xs font-medium text-muted-foreground"
        >
          Prompt
        </label>
        <Textarea
          id="macro-editor-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Write a conventional commit message for the staged changes."
          className="min-h-28"
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          Insert mode
        </span>
        <ChoiceButtons
          value={insertMode}
          onChange={setInsertMode}
          columns={3}
          options={MACRO_INSERT_MODES.map((mode) => ({
            value: mode,
            label: INSERT_MODE_LABELS[mode],
          }))}
          aria-label="Macro insert mode"
        />
      </div>
      <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">Pin model</p>
          <p className="text-xs text-muted-foreground">
            Override this turn&apos;s model and effort when inserted.
          </p>
        </div>
        <Switch
          checked={pinRuntime}
          onCheckedChange={setPinRuntime}
          aria-label="Pin model and effort"
        />
      </div>
      {pinRuntime ? (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Provider
            </span>
            <Select value={providerId} onValueChange={handleProviderChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["claude-code", "codex"] as const).map((id) => (
                  <SelectItem key={id} value={id}>
                    <span className="flex min-w-0 items-center gap-2">
                      <ModelIcon providerId={id} className="size-3.5" />
                      <span className="truncate">
                        {getProviderLabel({ providerId: id })}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Model
            </span>
            <Select value={model} onValueChange={handleModelChange}>
              <SelectTrigger>
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
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Effort
            </span>
            <Select
              value={effort || "__default__"}
              onValueChange={(value) =>
                setEffort(value === "__default__" ? "" : (value as ModelEffort))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">Default (per model)</SelectItem>
                {effortOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      ) : null}
      {localError || error ? (
        <p className="text-xs text-destructive">{localError ?? error}</p>
      ) : null}
      <div className="flex items-center justify-end gap-2 pt-1">
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
