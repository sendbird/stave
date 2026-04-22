import { FileCode2, LoaderCircle, Search } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useShallow } from "zustand/react/shallow";
import { Badge, Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui";
import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import { useAppStore } from "@/store/app.store";
import { rankFileSearchResults, splitFileSearchPath } from "./file-search-utils";

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
  ] = useAppStore(useShallow((state) => [
    state.projectFiles,
    state.editorTabs,
    state.activeEditorTabId,
    state.refreshProjectFiles,
    state.openFileFromTree,
  ] as const));
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const suppressBlurRef = useRef(false);
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isPreparingFiles, setIsPreparingFiles] = useState(false);
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.trim();

  function getInputElement() {
    return wrapperRef.current?.querySelector<HTMLInputElement>("[data-slot='command-input']") ?? null;
  }

  useEffect(() => {
    if (!isOpen || projectFiles.length > 0) {
      return;
    }

    let cancelled = false;
    setIsPreparingFiles(true);
    void refreshProjectFiles().catch(() => {
      // IPC/fs failure — swallow; file list stays empty.
    }).finally(() => {
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
        target.isContentEditable
        || Boolean(target.closest("input, textarea, select, [role='textbox'], [contenteditable='true']"))
      ) {
        return;
      }

      event.preventDefault();

      const input = wrapperRef.current?.querySelector<HTMLInputElement>("[data-slot='command-input']");
      const isInputFocusable = input != null && input.offsetParent !== null;

      if (isInputFocusable) {
        setIsOpen(true);
        input.focus();
      } else {
        suppressBlurRef.current = true;
        setIsMobileExpanded(true);
        setIsOpen(true);
        setTimeout(() => {
          wrapperRef.current?.querySelector<HTMLInputElement>("[data-slot='command-input']")?.focus();
          suppressBlurRef.current = false;
        }, 50);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const openEditorItems = useMemo(() => {
    const activeTab = editorTabs.find((tab) => tab.id === activeEditorTabId) ?? null;
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

  const openEditorFilePaths = useMemo(() => new Set(openEditorItems.map((item) => item.filePath)), [openEditorItems]);

  const filteredFileItems = useMemo(() => rankFileSearchResults({
    files: projectFiles,
    query: normalizedQuery,
    limit: DEFAULT_FILE_RESULT_LIMIT,
  }).map((item) => toFileItem(item.filePath, item.score)), [normalizedQuery, projectFiles]);

  const browseFileItems = useMemo(
    () => filteredFileItems.filter((item) => !openEditorFilePaths.has(item.filePath)).slice(0, DEFAULT_FILE_RESULT_LIMIT),
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
    await openFileFromTree({ filePath: item.filePath });
    setQuery("");
    closeSearch();
  }

  function handleCompactButtonClick() {
    suppressBlurRef.current = true;
    setIsMobileExpanded(true);
    setIsOpen(true);
    setTimeout(() => {
      wrapperRef.current?.querySelector<HTMLInputElement>("[data-slot='command-input']")?.focus();
      suppressBlurRef.current = false;
    }, 50);
  }

  return (
    <div
      ref={wrapperRef}
      className={isMobileExpanded
        ? "relative w-[260px]"
        : "relative w-9 md:w-[260px] lg:w-[320px] xl:w-[380px]"
      }
      style={noDragStyle}
      onBlurCapture={(event) => {
        if (suppressBlurRef.current) {
          return;
        }
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && wrapperRef.current?.contains(nextTarget)) {
          return;
        }
        closeSearch();
      }}
    >
      <button
        className={isMobileExpanded
          ? "hidden"
          : "flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-background/75 text-muted-foreground transition-colors hover:bg-background hover:text-foreground md:hidden"
        }
        onClick={handleCompactButtonClick}
        aria-label="Go to file"
        style={noDragStyle}
      >
        <Search className="size-4" />
      </button>

      <div className={isMobileExpanded ? undefined : "hidden md:block"}>
        <Command
          shouldFilter={false}
          className="relative overflow-visible bg-transparent p-0 [&_[data-slot=command-input-wrapper]]:p-0 [&_[data-slot=input-group]]:h-9 [&_[data-slot=input-group]]:rounded-lg [&_[data-slot=input-group]]:border-border/70 [&_[data-slot=input-group]]:bg-background/75 [&_[data-slot=input-group]]:shadow-none [&_[data-slot=input-group-addon]]:gap-1.5 [&_[data-slot=command-input]]:h-9 [&_[data-slot=command-input]]:px-0 [&_[data-slot=command-input]]:text-sm"
        >
          <div className="relative">
            <CommandInput
              value={query}
              onValueChange={(value) => {
                setQuery(value);
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
              data-file-search-input
            />
          </div>
          {isOpen ? (
            <div
              className={`absolute left-1/2 top-[calc(100%+2px)] ${UI_LAYER_CLASS.floatingChrome} w-full min-w-[260px] -translate-x-1/2 overflow-hidden rounded-xl border border-border/80 bg-card/96 shadow-2xl supports-backdrop-filter:backdrop-blur-xl lg:min-w-[320px] xl:min-w-[380px]`}
              style={noDragStyle}
            >
              <div className="flex items-center justify-between gap-3 border-b border-border/70 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Go to File</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {normalizedQuery ? "Matching workspace files" : "Open editors and workspace files"}
                  </p>
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {projectFiles.length}
                </Badge>
              </div>
              <CommandList className="max-h-[26rem] px-2 pb-2">
                {isPreparingFiles ? (
                  <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                    <LoaderCircle className="size-4 animate-spin" />
                    Refreshing workspace files...
                  </div>
                ) : null}
                {!isPreparingFiles && !hasItems ? (
                  <CommandEmpty className="py-8">
                    {projectFiles.length === 0
                      ? "No workspace files are indexed yet."
                      : "No matching files."}
                  </CommandEmpty>
                ) : null}
                {normalizedQuery
                  ? (
                    <CommandGroup heading={`Files (${filteredFileItems.length})`}>
                      {filteredFileItems.map((item) => {
                        const isOpenFile = editorTabs.some((tab) => tab.filePath === item.filePath);
                        const isActive = activeEditorTabId === `file:${item.filePath}`;

                        return (
                          <CommandItem
                            key={item.id}
                            value={item.id}
                            onMouseDown={(event) => event.preventDefault()}
                            onSelect={() => {
                              void handleSelectItem(item);
                            }}
                            className="items-start gap-3 rounded-lg px-3 py-3"
                          >
                            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background/80">
                              <FileCode2 className="size-4 text-muted-foreground" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate text-sm font-medium">{item.title}</span>
                                {isActive ? (
                                  <Badge variant="secondary" className="shrink-0">Active</Badge>
                                ) : isOpenFile ? (
                                  <Badge variant="outline" className="shrink-0">Open</Badge>
                                ) : null}
                              </div>
                              <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  )
                  : (
                    <>
                      {openEditorItems.length > 0 ? (
                        <CommandGroup heading={`Open editors (${openEditorItems.length})`}>
                          {openEditorItems.map((item) => {
                            const isActive = activeEditorTabId === `file:${item.filePath}`;

                            return (
                              <CommandItem
                                key={item.id}
                                value={item.id}
                                onMouseDown={(event) => event.preventDefault()}
                                onSelect={() => {
                                  void handleSelectItem(item);
                                }}
                                className="items-start gap-3 rounded-lg px-3 py-3"
                              >
                                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background/80">
                                  <FileCode2 className="size-4 text-muted-foreground" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="truncate text-sm font-medium">{item.title}</span>
                                    {isActive ? (
                                      <Badge variant="secondary" className="shrink-0">Active</Badge>
                                    ) : (
                                      <Badge variant="outline" className="shrink-0">Open</Badge>
                                    )}
                                  </div>
                                  <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
                                </div>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      ) : null}
                      {browseFileItems.length > 0 ? (
                        <CommandGroup heading={`Workspace files (${Math.min(browseFileItems.length, DEFAULT_FILE_RESULT_LIMIT)})`}>
                          {browseFileItems.map((item) => (
                            <CommandItem
                              key={item.id}
                              value={item.id}
                              onMouseDown={(event) => event.preventDefault()}
                              onSelect={() => {
                                void handleSelectItem(item);
                              }}
                              className="items-start gap-3 rounded-lg px-3 py-3"
                            >
                              <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background/80">
                                <FileCode2 className="size-4 text-muted-foreground" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <span className="truncate text-sm font-medium">{item.title}</span>
                                <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
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
