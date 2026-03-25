import { LoaderCircle } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useShallow } from "zustand/react/shallow";
import { Badge, Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, Kbd, KbdGroup, KbdSeparator } from "@/components/ui";
import { useAppStore } from "@/store/app.store";
import { rankFileSearchResults, splitFileSearchPath, type RankedFileSearchResult } from "./file-search-utils";

interface TopBarFileSearchProps {
  noDragStyle?: CSSProperties;
}

interface VisibleFileSection {
  key: string;
  heading: string;
  items: RankedFileSearchResult[];
}

const DEFAULT_FILE_RESULT_LIMIT = 120;
const OPEN_EDITOR_LIMIT = 8;

function getModifierLabel() {
  if (typeof navigator === "undefined") {
    return "Cmd";
  }

  return /(Mac|iPhone|iPad)/i.test(navigator.platform || navigator.userAgent) ? "Cmd" : "Ctrl";
}

function toDisplayResult(filePath: string): RankedFileSearchResult {
  const { fileName, directoryPath } = splitFileSearchPath({ filePath });
  return {
    filePath,
    fileName,
    directoryPath,
    score: 0,
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
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isPreparingFiles, setIsPreparingFiles] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.trim();
  const modifierLabel = useMemo(() => getModifierLabel(), []);

  function getInputElement() {
    return wrapperRef.current?.querySelector<HTMLInputElement>("[data-slot='command-input']") ?? null;
  }

  useEffect(() => {
    if (!isOpen || projectFiles.length > 0) {
      return;
    }

    let cancelled = false;
    setIsPreparingFiles(true);
    void refreshProjectFiles().finally(() => {
      if (!cancelled) {
        setIsPreparingFiles(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, projectFiles.length, refreshProjectFiles]);


  const openEditorItems = useMemo(() => {
    const activeTab = editorTabs.find((tab) => tab.id === activeEditorTabId) ?? null;
    const orderedTabs = activeTab
      ? [activeTab, ...editorTabs.filter((tab) => tab.id !== activeEditorTabId)]
      : editorTabs;
    const seen = new Set<string>();
    const items: RankedFileSearchResult[] = [];

    for (const tab of orderedTabs) {
      if (!tab.filePath || seen.has(tab.filePath)) {
        continue;
      }

      seen.add(tab.filePath);
      items.push(toDisplayResult(tab.filePath));

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
  }), [normalizedQuery, projectFiles]);

  const browseFileItems = useMemo(
    () => filteredFileItems.filter((item) => !openEditorFilePaths.has(item.filePath)).slice(0, DEFAULT_FILE_RESULT_LIMIT),
    [filteredFileItems, openEditorFilePaths],
  );

  const visibleSections = useMemo<VisibleFileSection[]>(() => (
    normalizedQuery
      ? [
          {
            key: "matches",
            heading: `Files (${filteredFileItems.length})`,
            items: filteredFileItems,
          },
        ]
      : [
          {
            key: "open-editors",
            heading: `Open editors (${openEditorItems.length})`,
            items: openEditorItems,
          },
          {
            key: "workspace-files",
            heading: `Workspace files (${Math.min(browseFileItems.length, DEFAULT_FILE_RESULT_LIMIT)})`,
            items: browseFileItems,
          },
        ].filter((section) => section.items.length > 0)
  ), [browseFileItems, filteredFileItems, normalizedQuery, openEditorItems]);

  const hasVisibleItems = visibleSections.some((section) => section.items.length > 0);

  async function handleSelectFile(filePath: string) {
    getInputElement()?.blur();
    await openFileFromTree({ filePath });
    setQuery("");
    setIsOpen(false);
  }

  return (
    <div
      ref={wrapperRef}
      className="relative min-w-[500px] w-[500px] lg:w-[560px] xl:w-[620px]"
      style={noDragStyle}
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && wrapperRef.current?.contains(nextTarget)) {
          return;
        }
        setIsOpen(false);
      }}
    >
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

              setIsOpen(false);
              getInputElement()?.blur();
            }}
            placeholder="Go to file..."
            data-file-search-input
          />
          <div className="pointer-events-none absolute inset-y-0 right-3 hidden items-center md:flex">
            <KbdGroup aria-label={`Keyboard shortcut ${modifierLabel} P`}>
              <Kbd>{modifierLabel}</Kbd>
              <KbdSeparator>+</KbdSeparator>
              <Kbd>P</Kbd>
            </KbdGroup>
          </div>
        </div>
        {isOpen ? (
          <div
            className="absolute left-0 right-0 top-[calc(100%+2px)] z-50 overflow-hidden rounded-xl border border-border/80 bg-card/96 shadow-2xl supports-backdrop-filter:backdrop-blur-xl"
            style={noDragStyle}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border/70 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Quick Open</p>
                <p className="truncate text-xs text-muted-foreground">
                  {normalizedQuery ? "Matching files" : "Open editors and workspace files"}
                </p>
              </div>
              <Badge variant="secondary" className="shrink-0">
                {projectFiles.length}
              </Badge>
            </div>
            <CommandList className="max-h-[26rem] px-2 pb-2">
              {isPreparingFiles ? (
                <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" />
                  Refreshing workspace files...
                </div>
              ) : null}
              {!isPreparingFiles && !hasVisibleItems ? (
                <CommandEmpty className="py-8">
                  {projectFiles.length === 0 ? "No workspace files are indexed yet." : "No matching files."}
                </CommandEmpty>
              ) : null}
              {!isPreparingFiles
                ? visibleSections.map((section) => (
                    <CommandGroup key={section.key} heading={section.heading}>
                      {section.items.map((item) => {
                        const isOpenFile = editorTabs.some((tab) => tab.filePath === item.filePath);
                        const isActive = activeEditorTabId === `file:${item.filePath}`;

                        return (
                          <CommandItem
                            key={item.filePath}
                            value={item.filePath}
                            onMouseDown={(event) => event.preventDefault()}
                            onSelect={() => {
                              void handleSelectFile(item.filePath);
                            }}
                            className="items-start gap-3 rounded-lg px-3 py-3"
                          >
                            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background/80">
                              <span className="text-xs font-medium text-muted-foreground">F</span>
                            </div>
                            <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium">{item.fileName}</span>
                              {isActive ? (
                                <Badge variant="secondary" className="shrink-0">Active</Badge>
                              ) : isOpenFile ? (
                                <Badge variant="outline" className="shrink-0">Open</Badge>
                              ) : null}
                            </div>
                            {item.directoryPath ? (
                              <p className="truncate text-xs text-muted-foreground">
                                {item.directoryPath}
                              </p>
                            ) : null}
                          </div>
                        </CommandItem>
                      );
                      })}
                    </CommandGroup>
                  ))
                : null}
            </CommandList>
          </div>
        ) : null}
      </Command>
    </div>
  );
}
