import { ProviderMark } from "@/components/system/ProviderMark";
import type { ProviderId } from "@/lib/providers/provider.types";

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

/**
 * The provider mark beside a model, under the name the model pickers and rows
 * already use: it is `ProviderMark` (`src/components/system/ProviderMark.tsx`),
 * sized by the caller's class.
 */
export function ModelIcon(args: ModelIconProps) {
  return <ProviderMark providerId={args.providerId} className={args.className} />;
}
