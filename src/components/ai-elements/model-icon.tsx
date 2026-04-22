import { useState } from "react";
import { getProviderFallbackLabel, getProviderIconUrl } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";

interface ModelIconProps {
  providerId: ProviderId;
  model?: string;
  className?: string;
}

export function ModelIcon(args: ModelIconProps) {
  const { providerId, model, className } = args;
  const [failed, setFailed] = useState(false);
  const isDarkMode = useAppStore((state) => state.isDarkMode);

  if (failed) {
    return (
      <span
        className={cn(
          "inline-flex size-4 items-center justify-center rounded-sm bg-secondary text-[10px] font-semibold text-muted-foreground",
          className
        )}
        aria-hidden
      >
        {getProviderFallbackLabel({ providerId })}
      </span>
    );
  }

  return (
    <img
      src={getProviderIconUrl({ providerId, model, isDarkMode })}
      alt=""
      aria-hidden
      className={cn("size-4 shrink-0 object-contain", className)}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
