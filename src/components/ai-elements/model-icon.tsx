import { useState } from "react";
import {
  getProviderFallbackLabel,
  getProviderIconUrl,
} from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import { cn } from "@/lib/utils";

interface ModelIconProps {
  providerId: ProviderId;
  /**
   * What the mark stands for at this call site. Not used for resolution — the
   * marks are vendor-level, so every model of one provider shares one mark.
   * Kept because call sites have it in hand and it documents intent.
   */
  model?: string;
  className?: string;
}

export function ModelIcon(args: ModelIconProps) {
  const { providerId, className } = args;
  const [failed, setFailed] = useState(false);

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
      src={getProviderIconUrl({ providerId })}
      alt=""
      aria-hidden
      className={cn("size-4 shrink-0 object-contain", className)}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
