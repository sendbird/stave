import type { ReactNode } from "react";
import { Fragment } from "react";
import { i18n } from "@/i18n";
import { Tooltip as AdsTooltip } from "@/components/ads/components/Tooltip";
import { Ellipsis, SlidersHorizontal } from "lucide-react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui";
import {
  COMPOSER_CONTROL_LABELS,
  composerControlIsIconOnly,
  partitionComposerFrameToolbar,
  type ComposerControlId,
  type ComposerControlLayout,
} from "@/lib/composer-controls";
import { sx } from "../ads/utils/stylex";
import { promptInputStyles } from "./prompt-input.styles";
import {
  COMPOSER_CONTROL_MENU_CONTENT,
  ComposerControlMenuList,
} from "./composer-control-menu";
import { ComposerStatusTray } from "@/components/ai-elements/composer-status-tray";
import {
  ComposerFrameStatusBar,
  ComposerFrameWing,
} from "./composer-frame";
import { PROMPT_TOOLBAR_ICON_BUTTON } from "./prompt-input-toolbar-parts";
import type { PromptInputProps } from "./prompt-input.types";

/**
 * Routes the composer controls to the rows that own them this frame: the
 * framed layout's left and right wings and bottom status bar, the classic
 * toolbar's control ids, and the `⋯` overflow tray with its Customize footer.
 * A plain function rather than a component, so the nodes it returns land in
 * the same places of the tree as before.
 */
export function buildComposerFrameChrome(args: {
  composerControlLayout: ComposerControlLayout;
  composerControlNodes: Partial<Record<ComposerControlId, ReactNode>>;
  onComposerControlPlacementsChange: PromptInputProps["onComposerControlPlacementsChange"];
  useComposerFrame: boolean;
  useComposerWings: boolean;
  macroQuickPicks: ReactNode;
  frameBottom: ReactNode;
  composerTrayOpen: boolean;
  setComposerTrayOpen: (open: boolean) => void;
  setComposerCustomizeOpen: (open: boolean) => void;
  composerIconButtonSize: "icon-sm" | "icon";
  interactionsDisabled: boolean;
}) {
  const {
    composerControlLayout,
    composerControlNodes,
    onComposerControlPlacementsChange,
    useComposerFrame,
    useComposerWings,
    macroQuickPicks,
    frameBottom,
    composerTrayOpen,
    setComposerTrayOpen,
    setComposerCustomizeOpen,
    composerIconButtonSize,
    interactionsDisabled,
  } = args;
  const canCustomizeComposerControls = Boolean(
    onComposerControlPlacementsChange,
  );
  const composerFrameWings = partitionComposerFrameToolbar(
    composerControlLayout.toolbar,
  );
  const showMacroQuickPicks = useComposerWings && Boolean(macroQuickPicks);
  /*
   * A placement list is the *layout*, not the contents: `composerControlNodes`
   * renders `null` for every control this session cannot offer (no plan
   * callback, no provider mode, ...). Filtering on the ids alone therefore
   * mounted a wing whose children were all `null`, and a wing is a bordered,
   * shadowed surface in its own right — so the composer grew an empty column
   * beside it. Hide the container, not just the controls.
   */
  const leftWingControlIds = composerFrameWings.left.filter((id) =>
    Boolean(composerControlNodes[id]),
  );
  const rightWingControlIds = composerFrameWings.right.filter((id) =>
    Boolean(composerControlNodes[id]),
  );
  const leftWing =
    useComposerWings &&
    (showMacroQuickPicks || leftWingControlIds.length > 0) ? (
      <ComposerFrameWing side="left">
        {showMacroQuickPicks ? macroQuickPicks : null}
        {leftWingControlIds.map((id) => (
          <Fragment key={id}>{composerControlNodes[id]}</Fragment>
        ))}
      </ComposerFrameWing>
    ) : null;
  const rightWing =
    useComposerWings && rightWingControlIds.length > 0 ? (
      <ComposerFrameWing side="right">
        {rightWingControlIds.map((id) => (
          <Fragment key={id}>{composerControlNodes[id]}</Fragment>
        ))}
      </ComposerFrameWing>
    ) : null;
  // The bottom shelf is ambient session state, so it carries the readouts that
  // are checked rather than operated. It is drawn whenever the frame supplies
  // either half — a workspace line, a runtime readout, or both.
  const statusBarControlIds = useComposerWings ? composerFrameWings.status : [];
  // Stave's own tooling rides here rather than a wing: the wings are the
  // provider's surface (plan, permission, thinking), and these are ours.
  const statusTrayItems = statusBarControlIds
    .filter((id) => Boolean(composerControlNodes[id]))
    .map((id) => ({
      id,
      label: COMPOSER_CONTROL_LABELS[id],
      node: composerControlNodes[id],
      iconOnly: composerControlIsIconOnly(id),
    }));
  // Classic composer: the controls share the model row, and the tray takes the
  // same slot it has on the framed shelf — in front of Runtime, which stays
  // last — so the `⋯` is in one place no matter which layout is in effect.
  const toolbarControlIds = useComposerWings
    ? []
    : composerControlLayout.toolbar;
  const toolbarRuntimeIndex = toolbarControlIds.indexOf("runtime");
  const toolbarTrayIndex =
    toolbarRuntimeIndex === -1 ? toolbarControlIds.length : toolbarRuntimeIndex;
  // Demoted controls live behind one `⋯`. It is rendered by whichever row owns
  // the composer's controls this frame — the in-card toolbar when the composer
  // is classic, the bottom shelf beside Runtime when it is framed — so the
  // model row never becomes the place users hunt for a control.
  const overflowMenuItems = composerControlLayout.overflow
    .filter((id) => Boolean(composerControlNodes[id]))
    .map((id) => ({
      id,
      label: COMPOSER_CONTROL_LABELS[id],
      node: composerControlNodes[id],
      iconOnly: composerControlIsIconOnly(id),
    }));
  const composerCustomizeMenuFooter = canCustomizeComposerControls ? (
    <>
      <div className={sx(promptInputStyles.menuSeparator)} />
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className={sx(promptInputStyles.customizeButton)}
        onClick={() => {
          setComposerTrayOpen(false);
          setComposerCustomizeOpen(true);
        }}
      >
        <SlidersHorizontal className={sx(promptInputStyles.icon3)} />
        {i18n.t("composer:promptInput.composerCustomizeMenuFooter")}</Button>
    </>
  ) : null;
  const composerOverflowTray =
    overflowMenuItems.length > 0 ? (
      <Popover open={composerTrayOpen} onOpenChange={setComposerTrayOpen}>
        <AdsTooltip content={i18n.t("composer:promptInput.title3")}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                // Sized for the row it stands in rather than by a lane rule:
                // an ADS icon size owns both axes, and a glyph-only button has
                // to stay square in each of them.
                size={composerIconButtonSize}
                disabled={interactionsDisabled}
                className={PROMPT_TOOLBAR_ICON_BUTTON}
                aria-label={i18n.t("composer:promptInput.ariaLabel10", { value1: overflowMenuItems.length })}
                data-composer-tray-trigger="true"
              />
            }
          >
            <Ellipsis className={sx(promptInputStyles.icon4)} />
          </PopoverTrigger>
        </AdsTooltip>
        <PopoverContent
          align={useComposerWings ? "end" : "start"}
          side="top"
          sideOffset={10}
          // The tray hosts controls that open dialogs (Review,
          // Compare, ...). Base UI portals those dialogs into this popover's
          // portal node, so a tray on the popover band (`z-[90]`) would paint
          // over the dialog band (`z-[80]`) it just opened. Composer-anchored
          // chrome is the honest band for it anyway.
          layer="floatingChrome"
          xstyle={COMPOSER_CONTROL_MENU_CONTENT}
        >
          <ComposerControlMenuList items={overflowMenuItems} />
          {composerCustomizeMenuFooter}
        </PopoverContent>
      </Popover>
    ) : null;

  const frameStatusBar =
    useComposerFrame && (frameBottom || statusTrayItems.length > 0) ? (
      <ComposerFrameStatusBar
        trailing={
          statusTrayItems.length > 0 ? (
            <ComposerStatusTray
              items={statusTrayItems}
              overflowItems={overflowMenuItems}
              overflowTray={composerOverflowTray}
              overflowFooter={composerCustomizeMenuFooter}
              disabled={interactionsDisabled}
            />
          ) : null
        }
      >
        {frameBottom}
      </ComposerFrameStatusBar>
    ) : null;

  return {
    canCustomizeComposerControls,
    leftWing,
    rightWing,
    toolbarControlIds,
    toolbarTrayIndex,
    composerOverflowTray,
    frameStatusBar,
  };
}
