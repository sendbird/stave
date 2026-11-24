import { i18n, useTranslation } from "@/i18n";
import { ClipboardPaste, Info, Link, Sparkles, Terminal } from "lucide-react";
import { ServiceLinkIcon } from "@/components/ui/service-link-badge";
import type { PromptTokenDescriptor } from "@/lib/prompt-token-chips";
import { resolveServiceLinkBadge } from "@/lib/service-link-badges";
import { cx, sx, type XstyleProp } from "@/components/aui/utils/stylex";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { tokenChipStyles } from "./prompt-token-chip.styles";

export function PromptTokenChip(args: {
  descriptor: PromptTokenDescriptor;
  compact?: boolean;
  showDetail?: boolean;
  className?: string;
  onAttachAsFile?: () => void;
} & XstyleProp) {
  useTranslation();
  const { descriptor, compact, xstyle } = args;
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
          : descriptor.kind === "pasted"
            ? ClipboardPaste
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

  const chipProps = {
    contentEditable: false as const,
    title: descriptor.detail ?? descriptor.token,
    "data-pasted-text-block": descriptor.kind === "pasted" ? descriptor.pastedTextBlock?.id : undefined,
  };
  const styles = [
    tokenChipStyles.chip,
    compact ? tokenChipStyles.compact : tokenChipStyles.roomy,
    toneStyle,
    xstyle,
  ];
  const content = (
    <>
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
    </>
  );

  if (!args.onAttachAsFile) return <span {...chipProps} className={cx(sx(styles), args.className)}>{content}</span>;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger render={<Button type="button" layout="host" variant="ghost" xstyle={styles} {...chipProps} />}>
        {content}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top">
        <DropdownMenuItem onClick={args.onAttachAsFile}>
          {i18n.t("composer:pastedText.attachAsFile")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
