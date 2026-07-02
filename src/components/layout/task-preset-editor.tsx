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
  const [effort, setEffort] = useState<TaskPresetEffort | typeof DEFAULT_EFFORT_VALUE>(
    initialPreset.effort ?? DEFAULT_EFFORT_VALUE,
  );

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
  const effortOptions = useMemo(
    () => listEffortsForPresetProvider(provider),
    [provider],
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
    ];
  }, [kind]);

  function handleKindChange(nextKindValue: string) {
    const nextKind: TaskPresetKind =
      nextKindValue === "cli-session" ? "cli-session" : "task";
    setKind(nextKind);
  }

  function handleProviderChange(nextProvider: string) {
    const providerId =
      nextProvider === "claude-code" || nextProvider === "codex"
        ? (nextProvider as ProviderId)
        : "claude-code";
    setProvider(providerId);
    const nextModels = listModelsForPresetProvider(providerId);
    if (!nextModels.includes(model)) {
      setModel(getDefaultModelForProvider({ providerId }));
    }
    const nextEfforts = listEffortsForPresetProvider(providerId).map(
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
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1">
        <label
          htmlFor="task-preset-editor-label"
          className="text-xs font-medium text-muted-foreground"
        >
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
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Type</span>
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
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          Provider
        </span>
        <Select value={provider} onValueChange={handleProviderChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {providerOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {kind === "task" ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            Model
          </span>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {toHumanModelName({ model: option })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {kind === "task" ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            Effort
          </span>
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
