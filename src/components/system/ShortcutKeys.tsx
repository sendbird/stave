import * as stylex from "@stylexjs/stylex";
import { Fragment, useMemo, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { i18n, useTranslation } from "@/i18n";
import { Kbd } from "@/components/ads/components/Kbd";
import { KbdGroup, KbdSeparator } from "@/components/ui/kbd";
import { resolveKeybindingPlatform } from "@/lib/keybindings/key-chord";
import type { KeybindingId } from "@/lib/keybindings/keybinding-registry";
import {
  resolveKeybindingDisplay,
  type KeybindingDisplay,
} from "@/lib/keybindings/keybinding-settings";
import { useAppStore } from "@/store/app.store";

import { vars } from "../ads/tokens/tokens.stylex";

export type ShortcutKeysPlacement = "list" | "tooltip";

/**
 * The keys of one shortcut as keycaps: `⌘ K` then `F`, or `⌘ P`.
 *
 * `list` is the keyboard shortcut list's form, with `+` between the keys of a
 * step. `tooltip` drops those separators so a control's hint stays one short
 * row, and lets the joiner take the tooltip's own ink: the tooltip paints
 * inverted, where the list's muted text would not read.
 */
export function ShortcutKeys({
  placement = "list",
  sequenceJoiner,
  sequences,
}: KeybindingDisplay & { placement?: ShortcutKeysPlacement }) {
  useTranslation();
  const inTooltip = placement === "tooltip";
  return (
    <span {...stylex.props(styles.keys, inTooltip && styles.keysInTooltip)}>
      {sequences.map((sequence, sequenceIndex) => (
        <Fragment key={`${sequence.join("-")}-${sequenceIndex}`}>
          {sequenceIndex > 0 ? (
            <span
              {...stylex.props(
                styles.joiner,
                inTooltip && styles.joinerInTooltip,
              )}
            >
              {sequenceJoiner === "then"
                ? i18n.t("shell:keybindings.ui.then")
                : i18n.t("shell:keybindings.ui.or")}
            </span>
          ) : null}
          <KbdGroup
            aria-label={i18n.t("shell:keyboardShortcutsDrawer.keyboardShortcut", {
              value1: sequence.join(" "),
            })}
          >
            {sequence.map((part, partIndex) => (
              <Fragment key={`${part}-${partIndex}`}>
                {partIndex > 0 && !inTooltip ? (
                  <KbdSeparator>+</KbdSeparator>
                ) : null}
                <Kbd size="sm">{part}</Kbd>
              </Fragment>
            ))}
          </KbdGroup>
        </Fragment>
      ))}
    </span>
  );
}

/**
 * The keys a registry shortcut answers to right now, rendered for a control's
 * tooltip (`Tooltip shortcut`). The user's Settings apply, so a remapped
 * `Cmd/Ctrl+K` key shows its new letter; `undefined` while the shortcut is
 * turned off, so the tooltip shows its label alone.
 */
export function useShortcutHint(id: KeybindingId | null): ReactNode {
  const [appShortcutKeys, promptCommentShortcut, visualCommentShortcut] =
    useAppStore(
      useShallow(
        (state) =>
          [
            state.settings.appShortcutKeys,
            state.settings.promptCommentShortcut,
            state.settings.visualCommentShortcut,
          ] as const,
      ),
    );
  const display = useMemo(
    () =>
      id
        ? resolveKeybindingDisplay(id, {
            platform: resolveKeybindingPlatform(),
            settings: {
              appShortcutKeys,
              promptCommentShortcut,
              visualCommentShortcut,
            },
          })
        : null,
    [id, appShortcutKeys, promptCommentShortcut, visualCommentShortcut],
  );
  return display ? <ShortcutKeys {...display} placement="tooltip" /> : undefined;
}

const styles = stylex.create({
  keys: {
    alignItems: "center",
    columnGap: vars["--ads-space-8"],
    display: "flex",
    flexWrap: "wrap",
    minInlineSize: 0,
    rowGap: 6,
  },
  keysInTooltip: {
    columnGap: vars["--ads-space-4"],
    flexWrap: "nowrap",
  },
  joiner: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },
  joinerInTooltip: { color: "inherit" },
});
