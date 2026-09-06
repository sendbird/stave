import { useState } from "react";
import {
  getProviderFallbackLabel,
  getProviderIconUrl,
} from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import { coreStyles } from "./ai-element-core.styles";
import { cx, sx } from "../ads/utils/stylex";

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
  const iconUrl = getProviderIconUrl({ providerId });

  if (failed || !iconUrl) {
    return (
      <span
        className={cx(sx(coreStyles.modelFallback), className)}
        aria-hidden
      >
        {getProviderFallbackLabel({ providerId })}
      </span>
    );
  }

  return (
    <img
      src={iconUrl}
      alt=""
      aria-hidden
      className={cx(sx(coreStyles.modelImage), className)}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
