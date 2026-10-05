import { i18n, useTranslation } from "@/i18n";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { FileCode2, Search } from "lucide-react";
import * as stylex from "@stylexjs/stylex";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Badge,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  Loader,
} from "@/components/ui";
import { AutocompleteInput } from "@/components/ads/headless/autocomplete";
import { transition } from "@/components/ads/recipes/transition";
import { cx, sx } from "@/components/ads/utils/stylex";
import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import { useAppStore } from "@/store/app.store";
import {
  rankFileSearchResults,
  splitFileSearchPath,
} from "./file-search-utils";
import { fileSearchStyles } from "./top-bar-file-search.styles";
import { topBarControlStyles } from "./top-bar.styles";

interface TopBarFileSearchProps {
  noDragStyle?: CSSProperties;
}

interface SearchCommandItem {
  id: string;
  filePath: string;
  title: string;
  subtitle: string;
  score: number;
}

const DEFAULT_FILE_RESULT_LIMIT = 120;
const OPEN_EDITOR_LIMIT = 8;

function toFileItem(filePath: string, score = 0): SearchCommandItem {
  const { fileName, directoryPath } = splitFileSearchPath({ filePath });
  return {
    id: `file:${filePath}`,
    filePath,
    title: fileName,
    subtitle: directoryPath || i18n.t("shell:topBarFileSearch.workspaceRoot"),
    score,
  };
}

export function TopBarFileSearch({ noDragStyle }: TopBarFileSearchProps) {
  useTranslation();
  const [
    repositoryFiles,
    editorTabs,
    activeEditorTabId,
    refreshRepositoryFiles,
    openFileFromTree,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.repositoryFiles,
          state.editorTabs,
          state.activeEditorTabId,
          state.refreshRepositoryFiles,
          state.openFileFromTree,
        ] as const,
    ),
  );
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const suppressBlurRef = useRef(false);
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isPreparingFiles, setIsPreparingFiles] = useState(false);
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.trim();

  function getInputElement() {
    return (
      wrapperRef.current?.querySelector<HTMLInputElement>(
        "[data-slot='command-input']",
      ) ?? null
    );
  }

  useEffect(() => {
    if (!isOpen || repositoryFiles.length > 0) {
      return;
    }

    let cancelled = false;
    setIsPreparingFiles(true);
    void refreshRepositoryFiles()
      .catch(() => {
        // IPC/fs failure — swallow; file list stays empty.
      })
      .finally(() => {
        if (!cancelled) {
          setIsPreparingFiles(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, repositoryFiles.length, refreshRepositoryFiles]);

  // Cmd/Ctrl+P keyboard shortcut to open file search
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const hasMod = event.ctrlKey || event.metaKey;
      if (!hasMod || event.altKey || event.shiftKey || event.code !== "KeyP") {
        return;
      }

      const target = event.target as HTMLElement;
      if (
        target.isContentEditable ||
        Boolean(
          target.closest(
            "input, textarea, select, [role='textbox'], [contenteditable='true']",
          ),
        )
      ) {
        return;
      }

      event.preventDefault();

      const input = wrapperRef.current?.querySelector<HTMLInputElement>(
        "[data-slot='command-input']",
      );
      const isInputFocusable = input != null && input.offsetParent !== null;

      if (isInputFocusable) {
        setIsOpen(true);
        input.focus();
      } else {
        suppressBlurRef.current = true;
        setIsMobileExpanded(true);
        setIsOpen(true);
        setTimeout(() => {
          wrapperRef.current
            ?.querySelector<HTMLInputElement>("[data-slot='command-input']")
            ?.focus();
          suppressBlurRef.current = false;
        }, 50);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const openEditorItems = useMemo(() => {
    const activeTab =
      editorTabs.find((tab) => tab.id === activeEditorTabId) ?? null;
    const orderedTabs = activeTab
      ? [activeTab, ...editorTabs.filter((tab) => tab.id !== activeEditorTabId)]
      : editorTabs;
    const seen = new Set<string>();
    const items: SearchCommandItem[] = [];

    for (const tab of orderedTabs) {
      if (!tab.filePath || seen.has(tab.filePath)) {
        continue;
      }

      seen.add(tab.filePath);
      items.push(toFileItem(tab.filePath));

      if (items.length >= OPEN_EDITOR_LIMIT) {
        break;
      }
    }

    return items;
  }, [activeEditorTabId, editorTabs, i18n.language]);

  const openEditorFilePaths = useMemo(
    () => new Set(openEditorItems.map((item) => item.filePath)),
    [openEditorItems, i18n.language],
  );

  const filteredFileItems = useMemo(
    () =>
      rankFileSearchResults({
        files: repositoryFiles,
        query: normalizedQuery,
        limit: DEFAULT_FILE_RESULT_LIMIT,
      }).map((item) => toFileItem(item.filePath, item.score)),
    [normalizedQuery, repositoryFiles, i18n.language],
  );

  const browseFileItems = useMemo(
    () =>
      filteredFileItems
        .filter((item) => !openEditorFilePaths.has(item.filePath))
        .slice(0, DEFAULT_FILE_RESULT_LIMIT),
    [filteredFileItems, openEditorFilePaths, i18n.language],
  );

  const hasItems = normalizedQuery
    ? filteredFileItems.length > 0
    : openEditorItems.length > 0 || browseFileItems.length > 0;

  function closeSearch() {
    setIsOpen(false);
    setIsMobileExpanded(false);
  }

  async function handleSelectItem(item: SearchCommandItem) {
    getInputElement()?.blur();
    setQuery("");
    closeSearch();
    await openFileFromTree({ filePath: item.filePath });
  }

  function handleCompactButtonClick() {
    suppressBlurRef.current = true;
    setIsMobileExpanded(true);
    setIsOpen(true);
    setTimeout(() => {
      wrapperRef.current
        ?.querySelector<HTMLInputElement>("[data-slot='command-input']")
        ?.focus();
      suppressBlurRef.current = false;
    }, 50);
  }

  return (
    <div
      ref={wrapperRef}
      className={sx(fileSearchStyles.root)}
      style={noDragStyle}
      onBlurCapture={(event) => {
        if (suppressBlurRef.current) {
          return;
        }
        const nextTarget = event.relatedTarget;
        if (
          nextTarget instanceof Node &&
          wrapperRef.current?.contains(nextTarget)
        ) {
          return;
        }
        closeSearch();
      }}
    >
      <AdsButton
        layout="host"
        type="submit"
        xstyle={[
          fileSearchStyles.compactTrigger,
          isMobileExpanded && fileSearchStyles.compactTriggerHidden,
        ]}
        onClick={handleCompactButtonClick}
        aria-label={i18n.t("shell:topBarFileSearch.goToFile")}
        style={noDragStyle}
      >
        <Search />
      </AdsButton>

      <div
        className={sx(
          fileSearchStyles.field,
          isMobileExpanded && fileSearchStyles.fieldExpanded,
        )}
      >
        <Command shouldFilter={false} className={sx(fileSearchStyles.command)}>
          <div
            data-slot="command-input-wrapper"
            className={sx(
              // The same two keys every other control in the 48px bar composes,
              // so the field shares their height, gutter, radius and fill
              // instead of restating four of them with different numbers.
              topBarControlStyles.control,
              topBarControlStyles.surface,
              // Same reason as the path chip in `TopBar.tsx`: `surface` carries
              // hover fill and ink, and on a plain `div` nothing else supplies
              // the transition, so the field's hover was the only hard cut in a
              // bar of fading controls.
              transition.colors,
              fileSearchStyles.inputRow,
              isOpen && fileSearchStyles.inputRowOpen,
            )}
          >
            <Search {...stylex.props(fileSearchStyles.searchIcon)} />
            <AutocompleteInput
              data-slot="command-input"
              className={sx(fileSearchStyles.input)}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              onKeyDown={(event) => {
                if (event.key !== "Escape") {
                  return;
                }

                event.preventDefault();
                if (query) {
                  setQuery("");
                  return;
                }

                closeSearch();
                getInputElement()?.blur();
              }}
              placeholder={i18n.t("shell:topBarFileSearch.goToFile2")}
              aria-label={i18n.t("shell:topBarFileSearch.goToFile")}
              aria-expanded={isOpen}
              data-file-search-input
            />
          </div>
          {isOpen ? (
            <div
              className={cx(
                sx(fileSearchStyles.panel),
                UI_LAYER_CLASS.floatingChrome,
              )}
              style={noDragStyle}
            >
              <div className={sx(fileSearchStyles.panelHeader)}>
                <div className={sx(fileSearchStyles.panelHeaderText)}>
                  <p className={sx(fileSearchStyles.panelEyebrow)}>{i18n.t("shell:topBarFileSearch.goToFile3")}</p>
                  <p className={sx(fileSearchStyles.panelSubtitle)}>
                    {normalizedQuery
                      ? i18n.t("shell:topBarFileSearch.matchingWorkspaceFiles")
                      : i18n.t("shell:topBarFileSearch.openEditorsAndWorkspaceFiles")}
                  </p>
                </div>
                <Badge
                  variant="secondary"
                  className={sx(fileSearchStyles.countBadge)}
                >
                  {repositoryFiles.length}
                </Badge>
              </div>
              <CommandList className={sx(fileSearchStyles.list)}>
                {isPreparingFiles ? (
                  <div className={sx(fileSearchStyles.loadingRow)}>
                    <Loader aria-hidden size="xs" variant="scan" />
                    {i18n.t("shell:topBarFileSearch.refreshingWorkspaceFiles")}
                  </div>
                ) : null}
                {!isPreparingFiles && !hasItems ? (
                  <CommandEmpty className={sx(fileSearchStyles.emptyRow)}>
                    {repositoryFiles.length === 0
                      ? i18n.t("shell:topBarFileSearch.noWorkspaceFilesAreIndexedYet")
                      : i18n.t("shell:topBarFileSearch.noMatchingFiles")}
                  </CommandEmpty>
                ) : null}
                {normalizedQuery ? (
                  <CommandGroup heading={i18n.t("shell:topBarFileSearch.files", { value1: filteredFileItems.length })}>
                    {filteredFileItems.map((item) => {
                      const isOpenFile = editorTabs.some(
                        (tab) => tab.filePath === item.filePath,
                      );
                      const isActive =
                        activeEditorTabId === `file:${item.filePath}`;

                      return (
                        <CommandItem
                          key={item.id}
                          value={item.id}
                          onMouseDown={(event) => event.preventDefault()}
                          onSelect={() => {
                            void handleSelectItem(item);
                          }}
                          className={sx(fileSearchStyles.resultRow)}
                        >
                          <div className={sx(fileSearchStyles.resultIconBox)}>
                            <FileCode2
                              {...stylex.props(fileSearchStyles.resultIcon)}
                            />
                          </div>
                          <div className={sx(fileSearchStyles.resultBody)}>
                            <div
                              className={sx(fileSearchStyles.resultTitleRow)}
                            >
                              <span className={sx(fileSearchStyles.resultTitle)}>
                                {item.title}
                              </span>
                              {isActive ? (
                                <Badge
                                  variant="secondary"
                                  className={sx(fileSearchStyles.resultBadge)}
                                >
                                  {i18n.t("shell:topBarFileSearch.active")}
                                </Badge>
                              ) : isOpenFile ? (
                                <Badge
                                  variant="outline"
                                  className={sx(fileSearchStyles.resultBadge)}
                                >
                                  {i18n.t("shell:topBarFileSearch.open")}
                                </Badge>
                              ) : null}
                            </div>
                            <p className={sx(fileSearchStyles.resultSubtitle)}>
                              {item.subtitle}
                            </p>
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                ) : (
                  <>
                    {openEditorItems.length > 0 ? (
                      <CommandGroup
                        heading={i18n.t("shell:topBarFileSearch.openEditors", { value1: openEditorItems.length })}
                      >
                        {openEditorItems.map((item) => {
                          const isActive =
                            activeEditorTabId === `file:${item.filePath}`;

                          return (
                            <CommandItem
                              key={item.id}
                              value={item.id}
                              onMouseDown={(event) => event.preventDefault()}
                              onSelect={() => {
                                void handleSelectItem(item);
                              }}
                              className={sx(fileSearchStyles.resultRow)}
                            >
                              <div
                                className={sx(fileSearchStyles.resultIconBox)}
                              >
                                <FileCode2
                                  {...stylex.props(fileSearchStyles.resultIcon)}
                                />
                              </div>
                              <div className={sx(fileSearchStyles.resultBody)}>
                                <div
                                  className={sx(fileSearchStyles.resultTitleRow)}
                                >
                                  <span
                                    className={sx(fileSearchStyles.resultTitle)}
                                  >
                                    {item.title}
                                  </span>
                                  {isActive ? (
                                    <Badge
                                      variant="secondary"
                                      className={sx(
                                        fileSearchStyles.resultBadge,
                                      )}
                                    >
                                      {i18n.t("shell:topBarFileSearch.active")}
                                    </Badge>
                                  ) : (
                                    <Badge
                                      variant="outline"
                                      className={sx(
                                        fileSearchStyles.resultBadge,
                                      )}
                                    >
                                      {i18n.t("shell:topBarFileSearch.open")}
                                    </Badge>
                                  )}
                                </div>
                                <p
                                  className={sx(
                                    fileSearchStyles.resultSubtitle,
                                  )}
                                >
                                  {item.subtitle}
                                </p>
                              </div>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    ) : null}
                    {browseFileItems.length > 0 ? (
                      <CommandGroup
                        heading={i18n.t("shell:topBarFileSearch.workspaceFiles", { value1: Math.min(browseFileItems.length, DEFAULT_FILE_RESULT_LIMIT) })}
                      >
                        {browseFileItems.map((item) => (
                          <CommandItem
                            key={item.id}
                            value={item.id}
                            onMouseDown={(event) => event.preventDefault()}
                            onSelect={() => {
                              void handleSelectItem(item);
                            }}
                            className={sx(fileSearchStyles.resultRow)}
                          >
                            <div className={sx(fileSearchStyles.resultIconBox)}>
                              <FileCode2
                                {...stylex.props(fileSearchStyles.resultIcon)}
                              />
                            </div>
                            <div className={sx(fileSearchStyles.resultBody)}>
                              <span className={sx(fileSearchStyles.resultTitle)}>
                                {item.title}
                              </span>
                              <p className={sx(fileSearchStyles.resultSubtitle)}>
                                {item.subtitle}
                              </p>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    ) : null}
                  </>
                )}
              </CommandList>
            </div>
          ) : null}
        </Command>
      </div>
    </div>
  );
}
