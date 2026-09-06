import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ModelIcon } from "@/components/ai-elements/model-icon";
import {
  getDefaultModelForProvider,
  getProviderLabel,
  getSdkModelOptions,
  listProviderIds,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import { cx, sx } from "@/components/ads/utils/stylex";
import { providerModelPickerStyles as styles } from "./provider-model-picker.styles";

/**
 * Reusable provider + model selector duo.
 *
 * Callers own the selected values so the component does not introduce new
 * runtime state.
 */

interface ProviderModelPickerProps {
  /** Prefix used to give both selects distinct accessible names. */
  ariaLabel?: string;
  selectedProvider: ProviderId;
  selectedModel: string;
  onProviderChange: (providerId: ProviderId) => void;
  onModelChange: (model: string) => void;
  /** Renderer-level disabled flag. Both selects get disabled together. */
  disabled?: boolean;
  /** Narrow control — when `false`, the provider select shows a destructive border. */
  providerAvailable?: boolean;
  /** Width of the provider select. Keeps launcher/reviewer visually consistent. */
  providerSelectClassName?: string;
  /** Width of the model select. Defaults to filling the remaining space. */
  modelSelectClassName?: string;
}

/**
 * When a provider is swapped, reset the model to the provider's default so we
 * never end up with an incompatible pairing. Callers can skip this helper if
 * they want to preserve the prior model.
 */
export function pickDefaultModelForProvider(providerId: ProviderId): string {
  return getDefaultModelForProvider({ providerId });
}

export function ProviderModelPicker(args: ProviderModelPickerProps) {
  const providerIds = useMemo(() => listProviderIds(), []);
  const providerModels = useMemo(
    () =>
      [
        ...new Set([
          args.selectedModel,
          ...getSdkModelOptions({ providerId: args.selectedProvider }),
        ]),
      ].filter(Boolean),
    [args.selectedModel, args.selectedProvider],
  );
  const providerAvailable = args.providerAvailable !== false;
  return (
    <div
      className={cx(
        sx(styles.root, !providerAvailable && styles.rootUnavailable),
      )}
    >
      <Select
        value={args.selectedProvider}
        onValueChange={(value) => args.onProviderChange(value as ProviderId)}
        disabled={args.disabled}
      >
        <SelectTrigger
          aria-label={`${args.ariaLabel ?? "Model"} provider`}
          className={cx(
            sx(
              styles.trigger,
              args.providerSelectClassName ? null : styles.providerTriggerWidth,
            ),
            args.providerSelectClassName,
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {providerIds.map((providerId) => (
            <SelectItem
              key={providerId}
              value={providerId}
              className={sx(styles.item)}
            >
              <span className={sx(styles.itemInner)}>
                <ModelIcon
                  providerId={providerId}
                  className={sx(styles.icon)}
                />
                {getProviderLabel({ providerId, variant: "full" })}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={args.selectedModel}
        onValueChange={(value) => args.onModelChange(value)}
        disabled={args.disabled}
      >
        <SelectTrigger
          aria-label={`${args.ariaLabel ?? "Model"} model`}
          className={cx(
            sx(styles.trigger, styles.modelTriggerWidth),
            args.modelSelectClassName,
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {providerModels.map((model) => (
            <SelectItem key={model} value={model} className={sx(styles.item)}>
              <span className={sx(styles.modelItemInner)}>
                <ModelIcon
                  providerId={args.selectedProvider}
                  model={model}
                  className={sx(styles.icon)}
                />
                <span className={sx(styles.modelName)}>
                  {toHumanModelName({ model })}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
