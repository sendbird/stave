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
import { cn } from "@/lib/utils";

/**
 * Reusable provider + model selector duo.
 *
 * Extracted from `ColiseumLauncherDialog` so the reviewer dialog can pick a
 * provider/model with the exact same UI and defaulting behaviour. Keeping this
 * small and dumb — callers own the selected values so the component does not
 * introduce new runtime state.
 */

interface ProviderModelPickerProps {
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
    () => getSdkModelOptions({ providerId: args.selectedProvider }),
    [args.selectedProvider],
  );
  const providerAvailable = args.providerAvailable !== false;
  return (
    <div
      className={cn(
        "flex w-full min-w-0 items-center gap-2",
        !providerAvailable && "rounded-md ring-1 ring-destructive/40",
      )}
    >
      <Select
        value={args.selectedProvider}
        onValueChange={(value) => args.onProviderChange(value as ProviderId)}
        disabled={args.disabled}
      >
        <SelectTrigger
          className={cn(
            "h-8 text-xs",
            args.providerSelectClassName ?? "w-[150px] shrink-0",
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {providerIds.map((providerId) => (
            <SelectItem
              key={providerId}
              value={providerId}
              className="text-xs"
            >
              <span className="flex items-center gap-2">
                <ModelIcon providerId={providerId} className="size-3.5" />
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
          className={cn(
            "h-8 w-full min-w-0 flex-1 text-xs",
            args.modelSelectClassName ?? "",
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {providerModels.map((model) => (
            <SelectItem key={model} value={model} className="text-xs">
              {toHumanModelName({ model })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
