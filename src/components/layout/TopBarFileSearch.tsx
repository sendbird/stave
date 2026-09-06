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
import { cx, sx } from "@/components/ads/utils/stylex";
import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import { useAppStore } from "@/store/app.store";
import {
  rankFileSearchResults,
  splitFileSearchPath,
} from "./file-search-utils";
import { fileSearchStyles } from "./top-bar-file-search.styles";

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
    subtitle: directoryPath || "workspace root",
    score,
  };
}

export function TopBarFileSearch({ noDragStyle }: TopBarFileSearchProps) {
  const [
    projectFiles,
    editorTabs,
    activeEditorTabId,
    refreshProjectFiles,
    openFileFromTree,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.projectFiles,
          state.editorTabs,
          state.activeEditorTabId,
          state.refreshProjectFiles,
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
    if (!isOpen || projectFiles.length > 0) {
      return;
    }

    let cancelled = false;
    setIsPreparingFiles(true);
    void refreshProjectFiles()
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
  }, [isOpen, projectFiles.length, refreshProjectFiles]);

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
  }, [activeEditorTabId, editorTabs]);

  const openEditorFilePaths = useMemo(
    () => new Set(openEditorItems.map((item) => item.filePath)),
    [openEditorItems],
  );

  const filteredFileItems = useMemo(
    () =>
      rankFileSearchResults({
        files: projectFiles,
        query: normalizedQuery,
        limit: DEFAULT_FILE_RESULT_LIMIT,
      }).map((item) => toFileItem(item.filePath, item.score)),
    [normalizedQuery, projectFiles],
  );

  const browseFileItems = useMemo(
    () =>
      filteredFileItems
        .filter((item) => !openEditorFilePaths.has(item.filePath))
        .slice(0, DEFAULT_FILE_RESULT_LIMIT),
    [filteredFileItems, openEditorFilePaths],
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
        aria-label="Go to file"
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
              placeholder="Go to file..."
              aria-label="Go to file"
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
                  <p className={sx(fileSearchStyles.panelEyebrow)}>Go to File</p>
                  <p className={sx(fileSearchStyles.panelSubtitle)}>
                    {normalizedQuery
                      ? "Matching workspace files"
                      : "Open editors and workspace files"}
                  </p>
                </div>
                <Badge
                  variant="secondary"
                  className={sx(fileSearchStyles.countBadge)}
                >
                  {projectFiles.length}
                </Badge>
              </div>
              <CommandList className={sx(fileSearchStyles.list)}>
                {isPreparingFiles ? (
                  <div className={sx(fileSearchStyles.loadingRow)}>
                    <Loader aria-hidden size="xs" variant="scan" />
                    Refreshing workspace files...
                  </div>
                ) : null}
                {!isPreparingFiles && !hasItems ? (
                  <CommandEmpty className={sx(fileSearchStyles.emptyRow)}>
                    {projectFiles.length === 0
                      ? "No workspace files are indexed yet."
                      : "No matching files."}
                  </CommandEmpty>
                ) : null}
                {normalizedQuery ? (
                  <CommandGroup heading={`Files (${filteredFileItems.length})`}>
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
                                  Active
                                </Badge>
                              ) : isOpenFile ? (
                                <Badge
                                  variant="outline"
                                  className={sx(fileSearchStyles.resultBadge)}
                                >
                                  Open
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
                        heading={`Open editors (${openEditorItems.length})`}
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
                                      Active
                                    </Badge>
                                  ) : (
                                    <Badge
                                      variant="outline"
                                      className={sx(
                                        fileSearchStyles.resultBadge,
                                      )}
                                    >
                                      Open
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
                        heading={`Workspace files (${Math.min(browseFileItems.length, DEFAULT_FILE_RESULT_LIMIT)})`}
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
