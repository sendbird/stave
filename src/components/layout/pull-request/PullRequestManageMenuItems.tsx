import * as stylex from "@stylexjs/stylex";
import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef } from "react";
import { Tooltip } from "@/components/aui/components/Tooltip";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Loader,
} from "@/components/ui";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { i18n, useTranslation, type I18nKey } from "@/i18n";
import { layoutShellStyles } from "../layout-shell.styles";
import { PullRequestEditDialog } from "./PullRequestEditDialog";
import type { PullRequestManageItem } from "./pull-request-manage-items";
import {
  usePullRequestManage,
  type PullRequestManageBusy,
  type PullRequestManageController,
  type PullRequestManageTarget,
} from "./use-pull-request-manage";

const ITEM_LABELS = {
  edit: "sourceControl:prManage.menu.edit",
  convert_to_draft: "sourceControl:prManage.menu.convertToDraft",
  auto_merge_on: "sourceControl:prManage.menu.autoMergeOn",
  auto_merge_off: "sourceControl:prManage.menu.autoMergeOff",
  auto_merge_checking: "sourceControl:prManage.menu.autoMergeChecking",
  close: "sourceControl:prManage.menu.close",
  reopen: "sourceControl:prManage.menu.reopen",
  archive_workspace: "sourceControl:prManage.menu.archiveWorkspace",
} as const satisfies Record<PullRequestManageItem, I18nKey>;

/** The write an item starts, for showing which one is running. */
const ITEM_BUSY: Partial<Record<PullRequestManageItem, PullRequestManageBusy>> = {
  convert_to_draft: "convert_to_draft",
  auto_merge_on: "auto_merge",
  auto_merge_off: "auto_merge",
  close: "close",
  reopen: "reopen",
};

/**
 * The manage actions of one pull request as dropdown items, by its state:
 * edit, convert to draft, auto-merge on/off, close; reopen once closed;
 * archive the workspace once merged. Render it inside a `DropdownMenuContent`.
 * The pull request is read from GitHub each time the menu opens, because the
 * auto-merge label and the head commit it pins must be current.
 *
 * `manage` comes from `usePullRequestManage` in the component that stays
 * mounted; that component also renders `PullRequestManageDialogs`.
 */
export function PullRequestManageMenuItems({ manage, separated = false }: {
  manage: PullRequestManageController;
  /** Draw a separator above and below, for a menu that has other items. */
  separated?: boolean;
}) {
  const { t } = useTranslation("sourceControl");
  const { loadDetails, prUrl, lifecycle } = manage;
  // Only an open (or not yet known) pull request has anything to read details for.
  const needsDetails = lifecycle === "open" || lifecycle === null;
  const requestedRef = useRef(false);
  useEffect(() => {
    if (!prUrl || !needsDetails || requestedRef.current) return;
    requestedRef.current = true;
    void loadDetails();
  }, [prUrl, needsDetails, loadDetails]);

  if (!prUrl) return null;

  const select = (item: PullRequestManageItem) => {
    switch (item) {
      case "edit": manage.setDialog("edit"); return;
      case "close": manage.setDialog("close"); return;
      case "convert_to_draft": void manage.convertToDraft(); return;
      case "auto_merge_on":
      case "auto_merge_off": void manage.toggleAutoMerge(manage.details); return;
      case "reopen": void manage.reopen(); return;
      case "archive_workspace": manage.archiveWorkspace(); return;
      case "auto_merge_checking": return;
    }
  };

  const reading = lifecycle === null && !manage.detailsError;
  const empty = !manage.items.length && !reading && !manage.detailsError;
  if (empty && separated) return null;

  return (
    <>
      {separated ? <DropdownMenuSeparator /> : null}
      {manage.items.map((item) => (
        <DropdownMenuItem
          key={item}
          data-pr-manage-item={item}
          disabled={manage.busy !== null || item === "auto_merge_checking"}
          onSelect={() => select(item)}
        >
          {item === "auto_merge_checking" || (manage.busy !== null && ITEM_BUSY[item] === manage.busy) ? (
            <span className={sx(styles.row)}>
              <Loader aria-hidden size="xs" variant="verify" />
              {i18n.t(ITEM_LABELS[item])}
            </span>
          ) : i18n.t(ITEM_LABELS[item])}
        </DropdownMenuItem>
      ))}
      {reading ? (
        <DropdownMenuItem disabled data-pr-manage-item="loading">
          <span className={sx(styles.row)}>
            <Loader aria-hidden size="xs" variant="verify" />
            {t("prManage.menu.loading")}
          </span>
        </DropdownMenuItem>
      ) : null}
      {empty ? <DropdownMenuItem disabled data-pr-manage-item="none">{t("prManage.menu.noActions")}</DropdownMenuItem> : null}
      {manage.detailsError && needsDetails ? (
        <p className={sx(styles.notice)} role="status" data-pr-manage-error="">
          {t("prManage.menu.detailsUnavailable", { reason: manage.detailsError })}
        </p>
      ) : null}
      {separated ? <DropdownMenuSeparator /> : null}
    </>
  );
}

/** The edit dialog and the close confirmation. Mounted next to the menu, outside it. */
export function PullRequestManageDialogs({ manage }: { manage: PullRequestManageController }) {
  const { t } = useTranslation("sourceControl");
  if (!manage.prUrl) return null;
  const closing = manage.busy === "close";
  return (
    <>
      <PullRequestEditDialog
        open={manage.dialog === "edit"}
        onOpenChange={(open) => manage.setDialog(open ? "edit" : null)}
        prUrl={manage.prUrl}
        cwd={manage.cwd}
        onSaved={() => manage.afterWrite()}
      />
      <Dialog open={manage.dialog === "close"} onOpenChange={(open) => { if (!closing) manage.setDialog(open ? "close" : null); }}>
        <DialogContent showCloseButton={false} data-pr-close-dialog="">
          <DialogHeader>
            <DialogTitle>
              {manage.details ? t("prManage.closeDialog.title", { number: manage.details.number }) : t("prManage.closeDialog.titleUnknown")}
            </DialogTitle>
            <DialogDescription>{t("prManage.closeDialog.description")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={closing} onClick={() => manage.setDialog(null)}>
              {i18n.t("common:actions.cancel")}
            </Button>
            <Button type="button" variant="destructive" disabled={manage.busy !== null} onClick={() => void manage.confirmClose()}>
              {closing ? <Loader aria-hidden size="xs" variant="persist" /> : null}
              {closing ? t("prManage.closeDialog.closing") : t("prManage.closeDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * A compact "More actions" button that opens the manage menu for a pull
 * request named by URL, for surfaces without a PR status menu of their own.
 */
export function PullRequestManageMenuButton(props: PullRequestManageTarget & { prUrl: string }) {
  const { t } = useTranslation("sourceControl");
  const manage = usePullRequestManage(props);
  return (
    <>
      <DropdownMenu>
        <Tooltip content={t("prManage.menu.moreActions")}>
          <span className={sx(layoutShellStyles.inlineFlex)}>
            <DropdownMenuTrigger
              render={<Button type="button" size="icon-sm" variant="ghost" aria-label={t("prManage.menu.moreActions")} data-pr-manage-trigger="" />}
            >
              <MoreHorizontal aria-hidden className={sx(styles.triggerIcon)} />
            </DropdownMenuTrigger>
          </span>
        </Tooltip>
        <DropdownMenuContent align="end" xstyle={styles.menu}>
          <PullRequestManageMenuItems manage={manage} />
        </DropdownMenuContent>
      </DropdownMenu>
      <PullRequestManageDialogs manage={manage} />
    </>
  );
}

const styles = stylex.create({
  row: { alignItems: "center", display: "flex", gap: vars["--aui-space-8"] },
  menu: { minInlineSize: "14rem" },
  triggerIcon: { blockSize: vars["--aui-control-icon-size-sm"], inlineSize: vars["--aui-control-icon-size-sm"] },
  notice: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    margin: 0,
    maxInlineSize: "20rem",
    overflowWrap: "anywhere",
    paddingBlock: vars["--aui-space-4"],
    paddingInline: vars["--aui-space-8"],
  },
});
