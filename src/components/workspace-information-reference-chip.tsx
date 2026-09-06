import * as stylex from "@stylexjs/stylex";
import { sx } from "@/components/ads/utils/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { Info, X } from "lucide-react";
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import {
  getWorkspaceInformationReferenceLabel,
  type WorkspaceInformationReference,
} from "@/lib/workspace-information-references";

export function WorkspaceInformationReferenceChip(args: {
  reference: WorkspaceInformationReference;
  disabled?: boolean;
  compact?: boolean;
  onRemove?: () => void;
}) {
  const label = getWorkspaceInformationReferenceLabel(args.reference);
  const scopeLabel = args.reference.scope === "section" ? "Section" : "Item";
  return (
    <span
      className={sx(styles.root, args.compact && styles.compact)}
    >
      <Info className={sx(styles.icon)} />
      <span className={sx(styles.label)}>
        <span className={sx(styles.prefix)}>Information</span>
        <span className={sx(styles.scope)}> / {scopeLabel} / </span>
        <span>{label}</span>
      </span>
      {args.onRemove ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                disabled={args.disabled}
                aria-label={`Remove ${label}`}
                onClick={args.onRemove}
                className={sx(styles.remove)}
              />
            }
          >
            <X className={sx(styles.removeIcon)} />
          </TooltipTrigger>
          <TooltipContent>Remove Information reference</TooltipContent>
        </Tooltip>
      ) : null}
    </span>
  );
}

const styles = stylex.create({
root:{display:"inline-flex",maxWidth:"100%",alignItems:"center",gap:6,borderRadius:4,borderWidth:1,borderStyle:"solid",borderColor:vars.colorBorder,backgroundColor:vars.colorAccentSoft,paddingInline:8,paddingBlock:4,fontSize:14,color:vars.colorText},
compact:{paddingInline:6,paddingBlock:2,fontSize:12},
icon: {width:14,height:14,flexShrink:0},
label: {minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},
prefix: {fontWeight:500},
scope: {color:vars.colorTextMuted},
remove: {marginRight:-4,width:20,height:20,color:{default:vars.colorTextMuted,":hover":vars.colorText}},
removeIcon: {width:12,height:12}
});
