import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import { ModelIcon } from "@/components/ai-elements/model-icon";
import {
  getDefaultModelForProvider,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import {
  listEffortsForPresetProvider,
  listModelsForPresetProvider,
  normalizeTaskPreset,
  type TaskPreset,
  type TaskPresetEffort,
  type TaskPresetKind,
} from "@/lib/task-presets";
import { sx } from "@/components/ads/utils/stylex";
import { taskPresetEditorStyles as styles } from "./task-preset-editor.styles";

const DEFAULT_EFFORT_VALUE = "__default__";

interface TaskPresetEditorProps {
  initialPreset: TaskPreset;
  submitLabel: string;
  onSave: (preset: TaskPreset) => void;
  onCancel: () => void;
}

export function TaskPresetEditor(props: TaskPresetEditorProps) {
  const { initialPreset, submitLabel, onSave, onCancel } = props;
  const [kind, setKind] = useState<TaskPresetKind>(initialPreset.kind);
  const [provider, setProvider] = useState<ProviderId>(initialPreset.provider);
  const [model, setModel] = useState<string>(
    initialPreset.model ??
      getDefaultModelForProvider({ providerId: initialPreset.provider }),
  );
  const [label, setLabel] = useState<string>(initialPreset.label);
  const [effort, setEffort] = useState<
    TaskPresetEffort | typeof DEFAULT_EFFORT_VALUE
  >(initialPreset.effort ?? DEFAULT_EFFORT_VALUE);

  useEffect(() => {
    setKind(initialPreset.kind);
    setProvider(initialPreset.provider);
    setModel(
      initialPreset.model ??
        getDefaultModelForProvider({ providerId: initialPreset.provider }),
    );
    setLabel(initialPreset.label);
    setEffort(initialPreset.effort ?? DEFAULT_EFFORT_VALUE);
  }, [initialPreset]);

  const modelOptions = useMemo(
    () => listModelsForPresetProvider(provider),
    [provider],
  );
  // Model-scoped so, e.g., GPT-5.6 Luna never offers "Ultra" — a value only
  // Sol/Terra accept.
  const effortOptions = useMemo(
    () => listEffortsForPresetProvider(provider, model),
    [provider, model],
  );
  const providerOptions = useMemo<
    { value: ProviderId; label: string }[]
  >(() => {
    if (kind === "cli-session") {
      return [
        { value: "claude-code", label: "Claude" },
        { value: "codex", label: "Codex" },
      ];
    }
    return [
      { value: "claude-code", label: "Claude Code" },
      { value: "codex", label: "Codex" },
      { value: "cursor", label: "Cursor Agent" },
      { value: "kiro", label: "Kiro CLI" },
    ];
  }, [kind]);

  function handleKindChange(nextKindValue: string) {
    const nextKind: TaskPresetKind =
      nextKindValue === "cli-session" ? "cli-session" : "task";
    setKind(nextKind);
    if (
      nextKind === "cli-session" &&
      provider !== "claude-code" &&
      provider !== "codex"
    ) {
      setProvider("claude-code");
      setModel(getDefaultModelForProvider({ providerId: "claude-code" }));
      setEffort(DEFAULT_EFFORT_VALUE);
    }
  }

  function handleProviderChange(nextProvider: string) {
    const providerId =
      nextProvider === "claude-code" ||
      nextProvider === "codex" ||
      (kind === "task" &&
        (nextProvider === "cursor" || nextProvider === "kiro"))
        ? (nextProvider as ProviderId)
        : "claude-code";
    setProvider(providerId);
    const nextModels = listModelsForPresetProvider(providerId);
    const nextModel = nextModels.includes(model)
      ? model
      : getDefaultModelForProvider({ providerId });
    if (nextModel !== model) {
      setModel(nextModel);
    }
    const nextEfforts = listEffortsForPresetProvider(providerId, nextModel).map(
      (option) => option.value,
    );
    if (
      effort !== DEFAULT_EFFORT_VALUE &&
      !nextEfforts.includes(effort as TaskPresetEffort)
    ) {
      setEffort(DEFAULT_EFFORT_VALUE);
    }
  }

  function handleModelChange(nextModel: string) {
    setModel(nextModel);
    // Some Codex models accept a narrower effort scale than others (e.g.
    // GPT-5.6 Luna has no "Ultra"); drop back to the default when the
    // currently selected effort isn't valid for the new model.
    const nextEfforts = listEffortsForPresetProvider(provider, nextModel).map(
      (option) => option.value,
    );
    if (
      effort !== DEFAULT_EFFORT_VALUE &&
      !nextEfforts.includes(effort as TaskPresetEffort)
    ) {
      setEffort(DEFAULT_EFFORT_VALUE);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeTaskPreset({
      id: initialPreset.id,
      label,
      kind,
      provider,
      model,
      effort: effort === DEFAULT_EFFORT_VALUE ? undefined : effort,
      contextMode: initialPreset.contextMode,
    });
    onSave(normalized);
  }

  return (
    <form className={sx(styles.form)} onSubmit={handleSubmit}>
      <div className={sx(styles.field)}>
        <label htmlFor="task-preset-editor-label" className={sx(styles.label)}>
          Label
        </label>
        <Input
          id="task-preset-editor-label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Opus 4.7"
          autoFocus
        />
      </div>
      <div className={sx(styles.field)}>
        <span className={sx(styles.label)}>Type</span>
        <Select value={kind} onValueChange={handleKindChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="task">Task</SelectItem>
            <SelectItem value="cli-session">CLI session</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className={sx(styles.field)}>
        <span className={sx(styles.label)}>Provider</span>
        <Select value={provider} onValueChange={handleProviderChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {providerOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <span className={sx(styles.option)}>
                  <ModelIcon
                    providerId={option.value}
                    className={sx(styles.optionIcon)}
                  />
                  <span className={sx(styles.optionLabel)}>{option.label}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {kind === "task" && effortOptions.length > 0 ? (
        <div className={sx(styles.field)}>
          <span className={sx(styles.label)}>Model</span>
          <Select value={model} onValueChange={handleModelChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  <span className={sx(styles.option)}>
                    <ModelIcon
                      providerId={provider}
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
        </div>
      ) : null}
      {kind === "task" ? (
        <div className={sx(styles.field)}>
          <span className={sx(styles.label)}>Effort</span>
          <Select
            value={effort}
            onValueChange={(value) =>
              setEffort(value as TaskPresetEffort | typeof DEFAULT_EFFORT_VALUE)
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DEFAULT_EFFORT_VALUE}>
                Default (per model)
              </SelectItem>
              {effortOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className={sx(styles.actions)}>
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
