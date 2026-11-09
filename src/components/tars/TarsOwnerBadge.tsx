import { useTranslation } from "@/i18n";
import { Badge } from "@/components/aui/components/Badge";
import type { XstyleProp } from "@/components/aui/utils/stylex";
import type { TarsOwnershipTarget } from "@/lib/tars/ownership";
import { useTarsOwner } from "@/store/tars-snapshot-store";

/** A compact owner mark: Tars holds this work, so its stop and take-over go through Tars. */
export function TarsOwnerBadge({ xstyle }: XstyleProp) {
  const { t } = useTranslation(["shell"]);
  return (
    <Badge size="sm" tone="accent" variant="outlined" xstyle={xstyle} title={t("shell:tars.owner.title")} data-tars-owner="">
      {t("shell:tars.owner.label")}
    </Badge>
  );
}

/** The owner mark for a task or run, shown only while an active Tars responsibility holds it. */
export function TarsOwnerLabel({ target, xstyle }: { target: TarsOwnershipTarget } & XstyleProp) {
  const owner = useTarsOwner(target);
  return owner ? <TarsOwnerBadge xstyle={xstyle} /> : null;
}
