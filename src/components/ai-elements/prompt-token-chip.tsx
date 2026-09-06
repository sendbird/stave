import { Info, Link, Sparkles, Terminal } from "lucide-react";
import { ServiceLinkIcon } from "@/components/ui/service-link-badge";
import type { PromptTokenDescriptor } from "@/lib/prompt-token-chips";
import { resolveServiceLinkBadge } from "@/lib/service-link-badges";
import { cx, sx } from "@/components/ads/utils/stylex";
import { tokenChipStyles } from "./prompt-token-chip.styles";

export function PromptTokenChip(args: {
  descriptor: PromptTokenDescriptor;
  compact?: boolean;
  showDetail?: boolean;
  className?: string;
}) {
  const { descriptor, compact, className } = args;
  const showDetail = args.showDetail ?? !compact;
  // serviceLink may be absent on deserialized tokens — re-derive it from the URL.
  const serviceLinkKind =
    descriptor.kind === "link"
      ? descriptor.serviceLink ?? resolveServiceLinkBadge(descriptor.token)?.kind
      : undefined;
  const Icon =
    descriptor.kind === "information"
      ? Info
      : descriptor.kind === "skill"
        ? Sparkles
        : descriptor.kind === "link"
          ? Link
          : Terminal;
  const toneStyle =
    descriptor.kind === "information"
      ? tokenChipStyles.information
      : descriptor.kind === "skill"
        ? tokenChipStyles.skill
        : tokenChipStyles.plain;
  const detailToneStyle =
    descriptor.kind === "information"
      ? tokenChipStyles.informationDetail
      : descriptor.kind === "skill"
        ? tokenChipStyles.skillDetail
        : tokenChipStyles.plainDetail;

  return (
    <span
      contentEditable={false}
      title={descriptor.detail ?? descriptor.token}
      className={cx(
        sx(
          tokenChipStyles.chip,
          compact ? tokenChipStyles.compact : tokenChipStyles.roomy,
          toneStyle,
        ),
        className,
      )}
    >
      {serviceLinkKind ? (
        <ServiceLinkIcon
          kind={serviceLinkKind}
          className={sx(
            tokenChipStyles.icon,
            compact
              ? tokenChipStyles.serviceIconCompact
              : tokenChipStyles.serviceIconRoomy,
          )}
        />
      ) : (
        <Icon
          className={sx(
            tokenChipStyles.icon,
            compact ? tokenChipStyles.iconCompact : tokenChipStyles.iconRoomy,
          )}
        />
      )}
      <span className={sx(tokenChipStyles.label)}>{descriptor.label}</span>
      {showDetail && descriptor.detail ? (
        <span className={sx(tokenChipStyles.detail, detailToneStyle)}>
          {descriptor.detail}
        </span>
      ) : null}
    </span>
  );
}
