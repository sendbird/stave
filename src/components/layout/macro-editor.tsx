import { I18N_NAMESPACES, useTranslation, i18n } from "@/i18n";
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
import type { ProviderId } from "@/lib/providers/provider.types";
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
import { sx } from "@/components/ads/utils/stylex";
import { macroEditorStyles as styles } from "./macro-editor.styles";

const INSERT_MODE_OPTIONS: Array<{
  value: MacroInsertMode;
  label: string;
  description: string;
}> = [
  {
    value: "replace",
    get label() { return i18n.t("settings:general.soundControls.replace"); },
    get description() { return i18n.t("settings:macroEditor.swapTheCurrentComposerTextFor"); },
  },
  {
    value: "append",
    get label() { return i18n.t("settings:macroEditor.append"); },
    get description() { return i18n.t("settings:macroEditor.addThisPromptAfterTheCurrent"); },
  },
  {
    value: "prepend",
    get label() { return i18n.t("settings:macroEditor.prepend"); },
    get description() { return i18n.t("settings:macroEditor.addThisPromptBeforeTheCurrent"); },
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
  const { t } = useTranslation(I18N_NAMESPACES);
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
  const [providerId, setProviderId] = useState<ProviderId>(
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
    const nextProviderId =
      nextProvider === "codex" ||
      nextProvider === "cursor" ||
      nextProvider === "kiro"
        ? nextProvider
        : "claude-code";
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
      setLocalError(i18n.t("settings:macroEditor.enterALabelAndASlug"));
      return;
    }
    const result = onSave(normalized);
    if (!result.ok) {
      setLocalError(result.error);
    }
  }

  return (
    <form className={sx(styles.form)} onSubmit={handleSubmit}>
      <LabeledField
        title={t("settings:macroEditor.label")}
        description={t("settings:macroEditor.theNameShownInSettingsThe")}
        layout="stacked"
      >
        <Input
          id="macro-editor-label"
          value={label}
          onChange={(event) => handleLabelChange(event.target.value)}
          placeholder={t("settings:macroEditor.conventionalCommit")}
          autoFocus
        />
      </LabeledField>
      <LabeledField
        title={t("settings:macroEditor.slug")}
        description={t("settings:macroEditor.typeInTheComposerToInsert", { value1: slug || "slug" })}
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
        title={t("common:labels.description")}
        description={t("settings:macroEditor.optionalHintShownUnderTheLabel")}
        layout="stacked"
      >
        <Input
          id="macro-editor-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t("settings:macroEditor.writeAConventionalCommitMessage")}
        />
      </LabeledField>
      <LabeledField
        title={t("settingsProviders:providersSection.codexRuntime.appToolApprovals.options.prompt.label")}
        description={t("settings:macroEditor.theTextInsertedIntoTheComposer")}
        layout="stacked"
      >
        <Textarea
          id="macro-editor-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          // i18n-ignore: example model-facing prompt content
          placeholder="Write a conventional commit message for the staged changes."
          xstyle={styles.body}
        />
      </LabeledField>
      <LabeledField
        title={t("settings:macroEditor.insertMode")}
        description={t("settings:macroEditor.chooseHowThisPromptCombinesWith")}
        layout="stacked"
      >
        <ChoiceButtons
          value={insertMode}
          onChange={setInsertMode}
          columns={3}
          options={INSERT_MODE_OPTIONS}
          aria-label={t("settings:macroEditor.macroInsertMode")}
        />
      </LabeledField>
      <SwitchField
        title={t("settings:macroEditor.runImmediately")}
        description={t("settings:macroEditor.sendThePromptAsSoonAs")}
        checked={instantRun}
        onCheckedChange={setInstantRun}
      />
      <SwitchField
        title={t("settings:macroEditor.pinModel")}
        description={t("settings:macroEditor.overrideThisTurnSModelAnd")}
        checked={pinRuntime}
        onCheckedChange={setPinRuntime}
      />
      {pinRuntime ? (
        <>
          <SelectField
            title={t("settingsProviders:mcpConfigEditor.editor.provider")}
            description={t("settings:macroEditor.theExecutionProviderUsedForThis")}
            value={providerId}
            onChange={handleProviderChange}
            options={(
              ["claude-code", "codex", "cursor", "kiro"] as const
            ).map((id) => ({
              value: id,
              label: getProviderLabel({ providerId: id }),
            }))}
          />
          <LabeledField
            title={t("settingsProviders:auxiliaryInference.model.title")}
            description={t("settings:macroEditor.theModelUsedWhenThisMacro")}
          >
            <Select value={model} onValueChange={handleModelChange}>
              <SelectTrigger className={sx(styles.modelTrigger)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {modelOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    <span className={sx(styles.option)}>
                      <ModelIcon
                        providerId={providerId}
                        model={option}
                        className={sx(styles.optionIcon)}
                      />
                      <span className={sx(styles.optionLabel)}>
                        {toHumanModelName({ model: option })}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabeledField>
          <SelectField
            title={t("settingsProviders:providersSection.claudeRuntime.effort.title")}
            description={t("settings:macroEditor.leaveOnTheModelDefaultOr")}
            value={effort || "__default__"}
            onChange={(value) =>
              setEffort(value === "__default__" ? "" : (value as ModelEffort))
            }
            options={[
              { value: "__default__", label: t("settings:macroEditor.defaultPerModel") },
              ...effortOptions.map((option) => ({
                value: option.value,
                label: option.label,
              })),
            ]}
          />
        </>
      ) : null}
      {localError || error ? (
        <p className={sx(styles.error)}>{localError ?? error}</p>
      ) : null}
      <div className={sx(styles.actions)}>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t("common:actions.cancel")}</Button>
        <Button type="submit" size="sm">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
