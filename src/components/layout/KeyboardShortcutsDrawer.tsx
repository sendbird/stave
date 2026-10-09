import { i18n, useTranslation } from "@/i18n";
import { Fragment, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Keyboard, Search, X } from "lucide-react";
import { Kbd } from "@/components/ads/components/Kbd";
import { transition } from "@/components/ads/recipes/transition";
import { sx } from "@/components/ads/utils/stylex";
import {
  Button,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  Input,
  KbdGroup,
  KbdSeparator,
} from "@/components/ui";
import {
  buildShortcutListSections,
  filterShortcutListSections,
  type ShortcutListItem,
} from "@/components/layout/keyboard-shortcuts-listing";
import { resolveKeybindingPlatform } from "@/lib/keybindings/key-chord";
import { useAppStore } from "@/store/app.store";
import { shortcutsDrawerStyles } from "./keyboard-shortcuts-drawer.styles";

interface KeyboardShortcutsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ShortcutKeys({
  sequences,
  sequenceJoiner,
}: Pick<ShortcutListItem, "sequences" | "sequenceJoiner">) {
  useTranslation();
  return (
    <div className={sx(shortcutsDrawerStyles.keys)}>
      {sequences.map((sequence, sequenceIndex) => (
        <Fragment key={`${sequence.join("-")}-${sequenceIndex}`}>
          {sequenceIndex > 0 ? (
            <span className={sx(shortcutsDrawerStyles.keysJoiner)}>
              {sequenceJoiner === "then"
                ? i18n.t("shell:keybindings.ui.then")
                : i18n.t("shell:keybindings.ui.or")}
            </span>
          ) : null}
          <KbdGroup aria-label={i18n.t("shell:keyboardShortcutsDrawer.keyboardShortcut", { value1: sequence.join(" ") })}>
            {sequence.map((part, partIndex) => (
              <Fragment key={`${part}-${partIndex}`}>
                {partIndex > 0 ? <KbdSeparator>+</KbdSeparator> : null}
                <Kbd size="sm">{part}</Kbd>
              </Fragment>
            ))}
          </KbdGroup>
        </Fragment>
      ))}
    </div>
  );
}

/**
 * The view-only keyboard shortcut list. Every row comes from the keybinding
 * registry (`src/lib/keybindings/keybinding-registry.ts`) with the user's
 * Settings applied, so the list cannot drift from what the keys do.
 */
export function KeyboardShortcutsDrawer({
  open,
  onOpenChange,
}: KeyboardShortcutsDrawerProps) {
  useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const platform = useMemo(() => resolveKeybindingPlatform(), []);
  const [
    modelShortcutKeys,
    modelShortcutEfforts,
    appShortcutKeys,
    promptCommentShortcut,
    visualCommentShortcut,
    taskPresets,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.modelShortcutKeys,
          state.settings.modelShortcutEfforts,
          state.settings.appShortcutKeys,
          state.settings.promptCommentShortcut,
          state.settings.visualCommentShortcut,
          state.settings.taskPresets,
        ] as const,
    ),
  );
  const sections = useMemo(
    () =>
      buildShortcutListSections({
        platform,
        settings: {
          appShortcutKeys,
          modelShortcutKeys,
          modelShortcutEfforts,
          promptCommentShortcut,
          visualCommentShortcut,
          taskPresets,
        },
      }),
    // i18n.language re-labels the list when the app language changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      platform,
      appShortcutKeys,
      modelShortcutKeys,
      modelShortcutEfforts,
      promptCommentShortcut,
      visualCommentShortcut,
      taskPresets,
      i18n.language,
    ],
  );
  const filteredSections = useMemo(
    () => filterShortcutListSections(sections, searchQuery),
    [sections, searchQuery],
  );
  const visibleShortcutCount = filteredSections.reduce(
    (count, section) => count + section.shortcuts.length,
    0,
  );
  const modifierLabel = platform === "mac" ? "Cmd" : "Ctrl";

  if (!open) {
    return null;
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="up">
      <DrawerContent
        className={sx(shortcutsDrawerStyles.content)}
        data-testid="keyboard-shortcuts-drawer"
      >
        <div className={sx(shortcutsDrawerStyles.frame)}>
          <DrawerHeader className={sx(shortcutsDrawerStyles.header)}>
            <div className={sx(shortcutsDrawerStyles.headerRow)}>
              <div className={sx(shortcutsDrawerStyles.headerTitleGroup)}>
                <Keyboard className={sx(shortcutsDrawerStyles.headerIcon)} />
                <div className={sx(shortcutsDrawerStyles.headerText)}>
                  <DrawerTitle className={sx(shortcutsDrawerStyles.title)}>
                    {i18n.t("shell:keyboardShortcutsDrawer.keyboardReference")}
                  </DrawerTitle>
                  <DrawerDescription
                    className={sx(shortcutsDrawerStyles.description)}
                  >
                    {i18n.t("shell:keyboardShortcutsDrawer.searchEveryActiveStaveShortcutAndCustom")}
                  </DrawerDescription>
                </div>
              </div>
              <div className={sx(shortcutsDrawerStyles.searchGroup)}>
                <div className={sx(shortcutsDrawerStyles.searchField)}>
                  <Search
                    className={sx(shortcutsDrawerStyles.searchIcon)}
                    aria-hidden="true"
                  />
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={i18n.t("shell:keyboardShortcutsDrawer.findAnActionOrKey")}
                    aria-label={i18n.t("shell:keyboardShortcutsDrawer.searchKeyboardShortcuts")}
                    xstyle={shortcutsDrawerStyles.searchInput}
                  />
                  {searchQuery ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      xstyle={shortcutsDrawerStyles.clearButton}
                      aria-label={i18n.t("shell:keyboardShortcutsDrawer.clearShortcutSearch")}
                      onClick={() => setSearchQuery("")}
                    >
                      <X className={sx(shortcutsDrawerStyles.clearIcon)} />
                    </Button>
                  ) : null}
                </div>
                <span className={sx(shortcutsDrawerStyles.shownCount)}>{i18n.t("shell:keyboardShortcutsDrawer.shownCount", { count: visibleShortcutCount })}</span>
              </div>
            </div>
          </DrawerHeader>
          <div className={sx(shortcutsDrawerStyles.grid)}>
            {filteredSections.length > 0 ? (
              filteredSections.map((section) => (
                <section
                  key={section.id}
                  className={sx(shortcutsDrawerStyles.section)}
                >
                  <header className={sx(shortcutsDrawerStyles.sectionHeader)}>
                    <div className={sx(shortcutsDrawerStyles.sectionHeaderRow)}>
                      <h2 className={sx(shortcutsDrawerStyles.sectionTitle)}>
                        {section.title}
                      </h2>
                      <span className={sx(shortcutsDrawerStyles.sectionCount)}>
                        {section.shortcuts.length}
                      </span>
                    </div>
                    <p className={sx(shortcutsDrawerStyles.sectionDescription)}>
                      {section.description}
                    </p>
                  </header>
                  <div className={sx(shortcutsDrawerStyles.sectionList)}>
                    {section.shortcuts.map((shortcut) => (
                      <div
                        key={shortcut.id}
                        data-keybinding-id={shortcut.id}
                        className={sx(
                          shortcutsDrawerStyles.shortcutRow,
                          transition.colors,
                        )}
                      >
                        <div className={sx(shortcutsDrawerStyles.shortcutText)}>
                          <p className={sx(shortcutsDrawerStyles.shortcutLabel)}>
                            {shortcut.label}
                          </p>
                          <p
                            className={sx(
                              shortcutsDrawerStyles.shortcutDescription,
                            )}
                          >
                            {shortcut.description}
                          </p>
                          {shortcut.meta ? (
                            <p className={sx(shortcutsDrawerStyles.shortcutMeta)}>
                              {shortcut.meta}
                            </p>
                          ) : null}
                        </div>
                        <ShortcutKeys
                          sequences={shortcut.sequences}
                          sequenceJoiner={shortcut.sequenceJoiner}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              ))
            ) : (
              <div className={sx(shortcutsDrawerStyles.emptyState)}>
                <p className={sx(shortcutsDrawerStyles.emptyTitle)}>{i18n.t("shell:keyboardShortcutsDrawer.noMatches", { query: searchQuery.trim() })}</p>
                <p className={sx(shortcutsDrawerStyles.emptyHint)}>
                  {i18n.t("shell:keyboardShortcutsDrawer.tryAnActionNamePanelOrKey")}
                </p>
              </div>
            )}
          </div>
          <DrawerFooter className={sx(shortcutsDrawerStyles.footer)}>
            <p className={sx(shortcutsDrawerStyles.footerNote)}>{i18n.t("shell:keyboardShortcutsDrawer.deviceBindings", { modifier: modifierLabel })}</p>
            <DrawerClose render={<Button variant="outline" />}>
              {i18n.t("shell:keyboardShortcutsDrawer.close")}
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
