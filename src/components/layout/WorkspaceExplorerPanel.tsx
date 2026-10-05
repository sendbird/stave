import { formatNumber } from "@/i18n/format";
import { i18n, useTranslation } from "@/i18n";
import { Button as AdsButton } from "@/components/ads/components/Button";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Copy,
  File,
  FilePlus,
  FolderOpen,
  FolderPlus,
  RefreshCcw,
  Search,
  SquareTerminal,
  Trash2,
  X,
} from "lucide-react";
import { GhosttyIcon, VSCodeIcon } from "@/components/brand-icons";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Virtuoso } from "react-virtuoso";
import {
  Button,
  Input,
  Loader,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { WorkspaceDirectoryEntry } from "@/lib/fs/fs.types";
import { sx } from "@/components/ads/utils/stylex";
import { ExplorerEntryIcon } from "./explorer-entry-icon";
import { explorerStyles } from "./workspace-explorer.styles";

interface ExplorerDirectoryState {
  status: "idle" | "loading" | "ready" | "error";
  entries: WorkspaceDirectoryEntry[];
  error?: string;
}

interface PendingExplorerCreate {
  type: "file" | "folder";
  placeholder: string;
}

interface SearchResultFile {
  file: string;
  matches: Array<{ line: number; text: string }>;
}

function normalizeSearchQuery(rawQuery: string) {
  const normalizedLineEndings = rawQuery.replace(/\r\n?/g, "\n");
  if (normalizedLineEndings.includes("\n")) {
    return normalizedLineEndings.replace(/^\n+|\n+$/g, "");
  }
  return normalizedLineEndings.trim();
}

function getParentDirectoryPath(args: { path: string }) {
  return args.path.split("/").slice(0, -1).join("/");
}

function highlightMatch(text: string, query: string) {
  if (!query) return text;
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return text;
  return (
    <>
      {text.slice(0, index)}
      <span className={sx(explorerStyles.matchHit)}>
        {text.slice(index, index + query.length)}
      </span>
      {text.slice(index + query.length)}
    </>
  );
}

type FlatSearchRow =
  | {
      kind: "file";
      file: string;
      fileName: string;
      dirPath: string;
      matchCount: number;
    }
  | {
      kind: "match";
      file: string;
      line: number;
      lineCount: number;
      text: string;
    };

function buildFlatRows(
  results: SearchResultFile[],
  collapsedFiles: Set<string>,
): FlatSearchRow[] {
  const rows: FlatSearchRow[] = [];
  for (const result of results) {
    const parts = result.file.split("/");
    rows.push({
      kind: "file",
      file: result.file,
      fileName: parts.pop() ?? result.file,
      dirPath: parts.join("/"),
      matchCount: result.matches.length,
    });
    if (!collapsedFiles.has(result.file)) {
      for (const match of result.matches) {
        rows.push({
          kind: "match",
          file: result.file,
          line: match.line,
          lineCount: Math.max(1, match.text.split("\n").length),
          text: match.text,
        });
      }
    }
  }
  return rows;
}

function ExplorerSearchPanel(props: {
  focusRequestNonce: number;
  workspaceCwd: string | undefined;
  onOpenFile: (path: string, line?: number) => void;
}) {
  const { t: tI18n } = useTranslation(["workspace"]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultFile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [limitHit, setLimitHit] = useState(false);
  const [error, setError] = useState("");
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const searchInputRef = useRef<HTMLTextAreaElement | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performSearch = useCallback(
    async (searchQuery: string) => {
      const normalizedQuery = normalizeSearchQuery(searchQuery);
      if (!normalizedQuery || !props.workspaceCwd) {
        setResults([]);
        setHasSearched(false);
        setLimitHit(false);
        setError("");
        return;
      }
      setIsSearching(true);
      setError("");
      try {
        const searchFn = window.api?.fs?.searchContent;
        if (!searchFn) return;
        const response = await searchFn({
          rootPath: props.workspaceCwd!,
          query: searchQuery,
        });
        if (response?.ok) {
          setResults(response.results);
          setLimitHit(response.limitHit);
          setCollapsedFiles(new Set());
        } else {
          setResults([]);
          setLimitHit(false);
          setError(response?.stderr ?? i18n.t("workspace:additionalCopy.message10"));
        }
      } catch (err) {
        setResults([]);
        setLimitHit(false);
        setError(String(err));
      } finally {
        setIsSearching(false);
        setHasSearched(true);
      }
    },
    [props.workspaceCwd],
  );

  const handleInputChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
      if (!normalizeSearchQuery(value)) {
        setResults([]);
        setHasSearched(false);
        setLimitHit(false);
        setError("");
        return;
      }
      searchTimerRef.current = setTimeout(() => {
        void performSearch(value);
      }, 300);
    },
    [performSearch],
  );

  useEffect(
    () => () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const input = searchInputRef.current;
    if (!input) {
      return;
    }
    input.focus({ preventScroll: true });
    input.select();
  }, [props.focusRequestNonce]);

  const handleClear = useCallback(() => {
    setQuery("");
    setResults([]);
    setHasSearched(false);
    setLimitHit(false);
    setError("");
    setCollapsedFiles(new Set());
  }, []);

  const toggleFileCollapse = useCallback((file: string) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(file)) {
        next.delete(file);
      } else {
        next.add(file);
      }
      return next;
    });
  }, []);

  const flatRows = useMemo(
    () => buildFlatRows(results, collapsedFiles),
    [results, collapsedFiles, i18n.resolvedLanguage],
  );
  const totalMatches = useMemo(
    () => results.reduce((sum, r) => sum + r.matches.length, 0),
    [results, i18n.resolvedLanguage],
  );
  const normalizedQuery = useMemo(() => normalizeSearchQuery(query), [query, i18n.resolvedLanguage]);
  const isMultilineQuery = normalizedQuery.includes("\n");
  const queryLineCount = Math.max(1, query.split(/\r\n?|\n/).length);

  return (
    <div className={sx(explorerStyles.searchRoot)}>
      <div className={sx(explorerStyles.searchField)}>
        <div className={sx(explorerStyles.searchAnchor)}>
          <Search className={sx(explorerStyles.searchIcon)} />
          <Textarea
            ref={searchInputRef}
            data-explorer-search-input
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                if (searchTimerRef.current)
                  clearTimeout(searchTimerRef.current);
                void performSearch(query);
              }
              if (
                !e.metaKey &&
                !e.ctrlKey &&
                !e.shiftKey &&
                e.key === "Escape"
              ) {
                e.preventDefault();
                handleClear();
              }
            }}
            rows={Math.min(
              6,
              Math.max(1, isMultilineQuery ? queryLineCount : 1),
            )}
            xstyle={explorerStyles.searchInput}
            placeholder={tI18n("workspace:workspaceExplorerPanel.searchInFilesOrPasteACode")}
            autoFocus
          />
          {query ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              xstyle={explorerStyles.searchClear}
            >
              <X className={sx(explorerStyles.searchClearIcon)} />
            </Button>
          ) : null}
        </div>
        <p className={sx(explorerStyles.searchHint)}>
          {isMultilineQuery
            ? tI18n("workspace:workspaceExplorerPanel.exactMultilineSearchEnabledPressCmdCtrl")
            : tI18n("workspace:workspaceExplorerPanel.typeToSearchPasteMultipleLinesTo")}
        </p>
      </div>

      {isSearching ? (
        <p className={sx(explorerStyles.searchStatus)}>
          <Loader aria-hidden size="xs" variant="scan" />
          {tI18n("workspace:workspaceExplorerPanel.searching")}</p>
      ) : null}

      {!isSearching && hasSearched && results.length === 0 && !error ? (
        <p className={sx(explorerStyles.searchEmpty)}>{tI18n("workspace:workspaceExplorerPanel.noResultsFound")}</p>
      ) : null}

      {error ? (
        <p className={sx(explorerStyles.searchError)}>{error}</p>
      ) : null}

      {!isSearching && results.length > 0 ? (
        <>
          <p className={sx(explorerStyles.searchCount)}>
            {tI18n("workspace:workspaceExplorerPanel.searchResultsSummary", { count: totalMatches, matches: formatNumber(totalMatches), files: formatNumber(results.length) })}
            {limitHit ? tI18n("workspace:workspaceExplorerPanel.resultLimitReached") : ""}
          </p>
          <div className={sx(explorerStyles.searchResults)}>
            <Virtuoso
              totalCount={flatRows.length}
              increaseViewportBy={1200}
              className={sx(explorerStyles.searchScroller)}
              itemContent={(index) => {
                const row = flatRows[index];
                if (!row) return null;
                if (row.kind === "file") {
                  const isCollapsed = collapsedFiles.has(row.file);
                  return (
                    <AdsButton
                      layout="host"
                      type="button"
                      onClick={() => toggleFileCollapse(row.file)}
                      xstyle={explorerStyles.resultFileRow}
                    >
                      {isCollapsed ? (
                        <ChevronRight
                          className={sx(explorerStyles.resultIcon)}
                        />
                      ) : (
                        <ChevronDown className={sx(explorerStyles.resultIcon)} />
                      )}
                      <File className={sx(explorerStyles.resultIcon)} />
                      <span className={sx(explorerStyles.resultFileName)}>
                        {row.fileName}
                      </span>
                      {row.dirPath ? (
                        <span className={sx(explorerStyles.resultDirPath)}>
                          {row.dirPath}
                        </span>
                      ) : null}
                      <span className={sx(explorerStyles.resultCount)}>
                        {row.matchCount}
                      </span>
                    </AdsButton>
                  );
                }
                return (
                  <AdsButton
                    layout="host"
                    type="button"
                    onClick={() => props.onOpenFile(row.file, row.line)}
                    xstyle={explorerStyles.resultMatchRow}
                    style={{ paddingLeft: "24px" }}
                  >
                    <span className={sx(explorerStyles.resultLineNumber)}>
                      {row.lineCount > 1
                        ? `${row.line}-${row.line + row.lineCount - 1}`
                        : row.line}
                    </span>
                    <span className={sx(explorerStyles.resultText)}>
                      {row.lineCount > 1 || isMultilineQuery
                        ? row.text
                        : highlightMatch(row.text, normalizedQuery)}
                    </span>
                  </AdsButton>
                );
              }}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

function ExplorerTreeRow(args: {
  entry: WorkspaceDirectoryEntry;
  depth: number;
  expanded: Set<string>;
  directoryStateByPath: Record<string, ExplorerDirectoryState>;
  onToggle: (path: string) => void;
  onOpenFile: (path: string) => void;
  onStartCreateFile: (directoryPath: string) => void;
  onStartCreateFolder: (directoryPath: string) => void;
  onCopyRelativePath: (path: string) => void;
  onCopyAbsolutePath: (path: string) => void;
  onOpenInFinder: (path: string) => void;
  onOpenInVSCode: (path: string) => void;
  onOpenInTerminal: (path: string) => void;
  onOpenInGhostty: (path: string) => void;
  onRefreshDirectory: (path: string) => void;
  onRequestDeleteFile: (path: string, name: string) => void;
  onRequestDeleteFolder: (path: string, name: string) => void;
}) {
  const { t: tI18n } = useTranslation(["workspace"]);
  const isFolder = args.entry.type === "folder";
  const isOpen = isFolder && args.expanded.has(args.entry.path);
  const directoryState = isFolder
    ? args.directoryStateByPath[args.entry.path]
    : undefined;
  const childEntries = directoryState?.entries ?? [];
  const parentDirectoryPath = isFolder
    ? args.entry.path
    : getParentDirectoryPath({ path: args.entry.path });
  const terminalTargetPath = isFolder ? args.entry.path : parentDirectoryPath;

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <AdsButton
              layout="host"
              type="button"
              onClick={() =>
                isFolder
                  ? args.onToggle(args.entry.path)
                  : args.onOpenFile(args.entry.path)
              }
              xstyle={explorerStyles.treeRow}
              style={{ paddingLeft: `${6 + args.depth * 14}px` }}
            />
          }
        >
          {isFolder ? (
            isOpen ? (
              <ChevronDown className={sx(explorerStyles.chevron)} />
            ) : (
              <ChevronRight className={sx(explorerStyles.chevron)} />
            )
          ) : (
            <span className={sx(explorerStyles.chevronSpacer)} />
          )}
          <ExplorerEntryIcon entry={args.entry} isOpen={isOpen} />
          <span className={sx(explorerStyles.entryName)}>
            {args.entry.name}
          </span>
          {isFolder && directoryState?.status === "loading" ? (
            <Loader
              aria-hidden
              className={sx(explorerStyles.rowLoader)}
              size="xs"
              variant="scan"
            />
          ) : null}
        </ContextMenuTrigger>
        <ContextMenuContent className={sx(explorerStyles.menu)}>
          {isFolder ? (
            <ContextMenuItem onSelect={() => args.onToggle(args.entry.path)}>
              {isOpen ? (
                <ChevronDown className={sx(explorerStyles.menuIcon)} />
              ) : (
                <ChevronRight className={sx(explorerStyles.menuIcon)} />
              )}
              {isOpen ? tI18n("workspace:workspaceExplorerPanel.collapseFolder") : tI18n("workspace:workspaceExplorerPanel.expandFolder")}
            </ContextMenuItem>
          ) : (
            <ContextMenuItem onSelect={() => args.onOpenFile(args.entry.path)}>
              <File className={sx(explorerStyles.menuIcon)} />
              {tI18n("workspace:workspaceExplorerPanel.openFile")}</ContextMenuItem>
          )}
          <ContextMenuItem
            onSelect={() => args.onStartCreateFile(parentDirectoryPath)}
          >
            <FilePlus className={sx(explorerStyles.menuIcon)} />
            {tI18n("workspace:workspaceExplorerPanel.newFileHere")}</ContextMenuItem>
          <ContextMenuItem
            onSelect={() => args.onStartCreateFolder(parentDirectoryPath)}
          >
            <FolderPlus className={sx(explorerStyles.menuIcon)} />
            {tI18n("workspace:workspaceExplorerPanel.newFolderHere")}</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => args.onCopyRelativePath(args.entry.path)}
          >
            <Copy className={sx(explorerStyles.menuIcon)} />
            {tI18n("workspace:workspaceExplorerPanel.copyRelativePath")}</ContextMenuItem>
          <ContextMenuItem
            onSelect={() => args.onCopyAbsolutePath(args.entry.path)}
          >
            <Copy className={sx(explorerStyles.menuIcon)} />
            {tI18n("workspace:workspaceExplorerPanel.copyAbsolutePath")}</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => args.onOpenInFinder(args.entry.path)}
          >
            <FolderOpen className={sx(explorerStyles.menuIcon)} />
            {tI18n("workspace:workspaceExplorerPanel.openInFinder")}</ContextMenuItem>
          <ContextMenuItem
            onSelect={() => args.onOpenInVSCode(args.entry.path)}
          >
            <VSCodeIcon className={sx(explorerStyles.menuIcon)} />
            {tI18n("workspace:workspaceExplorerPanel.openInVsCode")}</ContextMenuItem>
          <ContextMenuItem
            onSelect={() => args.onOpenInGhostty(terminalTargetPath)}
          >
            <GhosttyIcon className={sx(explorerStyles.menuIcon)} />
            {tI18n("workspace:workspaceExplorerPanel.openInGhostty")}</ContextMenuItem>
          <ContextMenuItem
            onSelect={() => args.onOpenInTerminal(terminalTargetPath)}
          >
            <SquareTerminal className={sx(explorerStyles.menuIcon)} />
            {tI18n("workspace:workspaceExplorerPanel.openInTerminal")}</ContextMenuItem>
          {isFolder ? (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                onSelect={() => args.onRefreshDirectory(args.entry.path)}
              >
                <RefreshCcw className={sx(explorerStyles.menuIcon)} />
                {tI18n("workspace:workspaceExplorerPanel.refreshFolder")}</ContextMenuItem>
            </>
          ) : null}
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            onSelect={() =>
              isFolder
                ? args.onRequestDeleteFolder(args.entry.path, args.entry.name)
                : args.onRequestDeleteFile(args.entry.path, args.entry.name)
            }
          >
            <Trash2 className={sx(explorerStyles.menuIcon)} />
            {isFolder ? tI18n("workspace:workspaceExplorerPanel.deleteFolder") : tI18n("workspace:workspaceExplorerPanel.deleteFile")}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {isFolder && isOpen ? (
        <>
          {directoryState?.status === "error" ? (
            <p
              className={sx(explorerStyles.childError)}
              style={{ paddingLeft: `${24 + args.depth * 14}px` }}
            >
              {directoryState.error ?? tI18n("workspace:workspaceExplorerPanel.failedToLoadFolder")}
            </p>
          ) : null}
          {directoryState?.status === "ready" && childEntries.length === 0 ? (
            <p
              className={sx(explorerStyles.childEmpty)}
              style={{ paddingLeft: `${24 + args.depth * 14}px` }}
            >
              {tI18n("workspace:workspaceExplorerPanel.empty")}</p>
          ) : null}
          {childEntries.map((child) => (
            <ExplorerTreeRow
              key={child.path}
              entry={child}
              depth={args.depth + 1}
              expanded={args.expanded}
              directoryStateByPath={args.directoryStateByPath}
              onToggle={args.onToggle}
              onOpenFile={args.onOpenFile}
              onStartCreateFile={args.onStartCreateFile}
              onStartCreateFolder={args.onStartCreateFolder}
              onCopyRelativePath={args.onCopyRelativePath}
              onCopyAbsolutePath={args.onCopyAbsolutePath}
              onOpenInFinder={args.onOpenInFinder}
              onOpenInVSCode={args.onOpenInVSCode}
              onOpenInGhostty={args.onOpenInGhostty}
              onOpenInTerminal={args.onOpenInTerminal}
              onRefreshDirectory={args.onRefreshDirectory}
              onRequestDeleteFile={args.onRequestDeleteFile}
              onRequestDeleteFolder={args.onRequestDeleteFolder}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}

export function WorkspaceExplorerPanel(props: {
  repositoryName: string;
  explorerError: string;
  pendingExplorerCreate: PendingExplorerCreate | null;
  pendingExplorerCreateInputRef: RefObject<HTMLInputElement | null>;
  pendingExplorerCreatePath: string;
  onPendingExplorerCreatePathChange: (value: string) => void;
  isCreatingExplorerEntry: boolean;
  onStartExplorerCreate: (type: "file" | "folder") => void;
  onCancelExplorerCreate: () => void;
  onSubmitExplorerCreate: () => Promise<void>;
  isExplorerLoading: boolean;
  explorerTree: WorkspaceDirectoryEntry[];
  expandedFolders: Set<string>;
  onCollapseAllFolders: () => void;
  onExpandAllFolders: () => Promise<void>;
  explorerDirectoryStateByPath: Record<string, ExplorerDirectoryState>;
  onToggleExplorerFolder: (path: string) => void;
  onOpenExplorerFile: (path: string, line?: number) => void;
  onStartExplorerFileCreate: (directoryPath: string) => void;
  onStartExplorerFolderCreate: (directoryPath: string) => void;
  onCopyExplorerRelativePath: (path: string) => void;
  onCopyExplorerAbsolutePath: (path: string) => void;
  onOpenExplorerInFinder: (path: string) => void;
  onOpenExplorerInVSCode: (path: string) => void;
  onOpenExplorerInTerminal: (path: string) => void;
  onOpenExplorerInGhostty: (path: string) => void;
  onRefreshExplorerDirectory: (path: string) => void;
  onRequestDeleteExplorerFile: (path: string, name: string) => void;
  onRequestDeleteExplorerFolder: (path: string, name: string) => void;
  searchRequestNonce: number;
  workspaceCwd?: string;
}) {
  const { t: tI18n } = useTranslation(["workspace"]);
  const [showSearch, setShowSearch] = useState(false);
  const [searchFocusNonce, setSearchFocusNonce] = useState(0);

  useEffect(() => {
    if (props.searchRequestNonce <= 0) {
      return;
    }
    setShowSearch(true);
    setSearchFocusNonce(props.searchRequestNonce);
  }, [props.searchRequestNonce]);

  return (
    <div className={sx(explorerStyles.root)}>
      <div className={sx(explorerStyles.header)}>
        <p className={sx(explorerStyles.repositoryName)}>{props.repositoryName}</p>
        <div className={sx(explorerStyles.headerActions)}>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    xstyle={[
                      explorerStyles.toolButton,
                      showSearch && explorerStyles.toolButtonActive,
                    ]}
                    onClick={() => {
                      if (showSearch) {
                        setShowSearch(false);
                        return;
                      }
                      setShowSearch(true);
                      setSearchFocusNonce((nonce) => nonce + 1);
                    }}
                  />
                }
              >
                <Search className={sx(explorerStyles.toolIcon)} />
              </TooltipTrigger>
              <TooltipContent side="bottom">{tI18n("workspace:workspaceExplorerPanel.searchInFiles")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    xstyle={explorerStyles.toolButton}
                    onClick={() => props.onStartExplorerCreate("file")}
                  />
                }
              >
                <FilePlus className={sx(explorerStyles.menuIcon)} />
              </TooltipTrigger>
              <TooltipContent side="bottom">{tI18n("workspace:workspaceExplorerPanel.addFile")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    xstyle={explorerStyles.toolButton}
                    onClick={() => props.onStartExplorerCreate("folder")}
                  />
                }
              >
                <FolderPlus className={sx(explorerStyles.menuIcon)} />
              </TooltipTrigger>
              <TooltipContent side="bottom">{tI18n("workspace:workspaceExplorerPanel.addFolder")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    xstyle={explorerStyles.toolButton}
                    onClick={props.onCollapseAllFolders}
                  />
                }
              >
                <ChevronsUp className={sx(explorerStyles.toolIcon)} />
              </TooltipTrigger>
              <TooltipContent side="bottom">{tI18n("workspace:workspaceExplorerPanel.collapseAll")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    xstyle={explorerStyles.toolButton}
                    onClick={() => void props.onExpandAllFolders()}
                  />
                }
              >
                <ChevronsDown className={sx(explorerStyles.toolIcon)} />
              </TooltipTrigger>
              <TooltipContent side="bottom">{tI18n("workspace:workspaceExplorerPanel.expandAll")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {showSearch ? (
        <div className={sx(explorerStyles.searchSlot)}>
          <ExplorerSearchPanel
            focusRequestNonce={searchFocusNonce}
            workspaceCwd={props.workspaceCwd}
            onOpenFile={props.onOpenExplorerFile}
          />
        </div>
      ) : null}

      {!showSearch && props.explorerError ? (
        <p className={sx(explorerStyles.panelError)}>
          {props.explorerError}
        </p>
      ) : null}
      {!showSearch ? (
        <div className={sx(explorerStyles.tree)}>
          {props.pendingExplorerCreate ? (
            <form
              className={sx(explorerStyles.createForm)}
              onSubmit={(event) => {
                event.preventDefault();
                void props.onSubmitExplorerCreate();
              }}
            >
              <div className={sx(explorerStyles.createRow)}>
                {props.pendingExplorerCreate.type === "file" ? (
                  <FilePlus className={sx(explorerStyles.createIcon)} />
                ) : (
                  <FolderPlus className={sx(explorerStyles.createIcon)} />
                )}
                <Input
                  ref={props.pendingExplorerCreateInputRef}
                  value={props.pendingExplorerCreatePath}
                  onChange={(event) =>
                    props.onPendingExplorerCreatePathChange(event.target.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      props.onCancelExplorerCreate();
                    }
                  }}
                  xstyle={explorerStyles.createInput}
                  placeholder={props.pendingExplorerCreate.placeholder}
                  aria-label={
                    props.pendingExplorerCreate.type === "file"
                      ? tI18n("workspace:workspaceExplorerPanel.newFilePath")
                      : tI18n("workspace:workspaceExplorerPanel.newFolderPath")
                  }
                  disabled={props.isCreatingExplorerEntry}
                />
                <Button
                  type="submit"
                  size="sm"
                  xstyle={explorerStyles.createSubmit}
                  disabled={props.isCreatingExplorerEntry}
                >
                  {props.isCreatingExplorerEntry ? tI18n("workspace:workspaceExplorerPanel.creating") : tI18n("workspace:workspaceExplorerPanel.create")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  xstyle={explorerStyles.createCancel}
                  onClick={props.onCancelExplorerCreate}
                  disabled={props.isCreatingExplorerEntry}
                >
                  {tI18n("workspace:workspaceExplorerPanel.cancel")}</Button>
              </div>
              <p className={sx(explorerStyles.createHint)}>
                {tI18n("workspace:workspaceExplorerPanel.enterAPathRelativeToTheRepository")}</p>
            </form>
          ) : null}
          {props.isExplorerLoading && props.explorerTree.length === 0 ? (
            <p className={sx(explorerStyles.statusLine)}>
              <Loader aria-hidden size="xs" variant="scan" />
              {tI18n("workspace:workspaceExplorerPanel.loadingFiles")}</p>
          ) : null}
          {!props.explorerError &&
          !props.isExplorerLoading &&
          props.explorerTree.length === 0 ? (
            <p className={sx(explorerStyles.emptyLine)}>{tI18n("workspace:workspaceExplorerPanel.noFilesFound")}</p>
          ) : null}
          {props.explorerTree.map((entry) => (
            <ExplorerTreeRow
              key={entry.path}
              entry={entry}
              depth={0}
              expanded={props.expandedFolders}
              directoryStateByPath={props.explorerDirectoryStateByPath}
              onToggle={props.onToggleExplorerFolder}
              onOpenFile={props.onOpenExplorerFile}
              onStartCreateFile={props.onStartExplorerFileCreate}
              onStartCreateFolder={props.onStartExplorerFolderCreate}
              onCopyRelativePath={props.onCopyExplorerRelativePath}
              onCopyAbsolutePath={props.onCopyExplorerAbsolutePath}
              onOpenInFinder={props.onOpenExplorerInFinder}
              onOpenInVSCode={props.onOpenExplorerInVSCode}
              onOpenInGhostty={props.onOpenExplorerInGhostty}
              onOpenInTerminal={props.onOpenExplorerInTerminal}
              onRefreshDirectory={props.onRefreshExplorerDirectory}
              onRequestDeleteFile={props.onRequestDeleteExplorerFile}
              onRequestDeleteFolder={props.onRequestDeleteExplorerFolder}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
