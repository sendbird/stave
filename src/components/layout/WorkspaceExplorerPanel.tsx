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
  LoaderCircle,
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
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import type { WorkspaceDirectoryEntry } from "@/lib/fs/fs.types";
import { ExplorerEntryIcon } from "./explorer-entry-icon";

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
      <span className="bg-yellow-300/40 text-foreground font-medium">{text.slice(index, index + query.length)}</span>
      {text.slice(index + query.length)}
    </>
  );
}

type FlatSearchRow =
  | { kind: "file"; file: string; fileName: string; dirPath: string; matchCount: number }
  | { kind: "match"; file: string; line: number; lineCount: number; text: string };

function buildFlatRows(results: SearchResultFile[], collapsedFiles: Set<string>): FlatSearchRow[] {
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
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultFile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [limitHit, setLimitHit] = useState(false);
  const [error, setError] = useState("");
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const searchInputRef = useRef<HTMLTextAreaElement | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performSearch = useCallback(async (searchQuery: string) => {
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
        setError(response?.stderr ?? "Search failed.");
      }
    } catch (err) {
      setResults([]);
      setLimitHit(false);
      setError(String(err));
    } finally {
      setIsSearching(false);
      setHasSearched(true);
    }
  }, [props.workspaceCwd]);

  const handleInputChange = useCallback((value: string) => {
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
  }, [performSearch]);

  useEffect(() => () => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
  }, []);

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

  const flatRows = useMemo(() => buildFlatRows(results, collapsedFiles), [results, collapsedFiles]);
  const totalMatches = useMemo(() => results.reduce((sum, r) => sum + r.matches.length, 0), [results]);
  const normalizedQuery = useMemo(() => normalizeSearchQuery(query), [query]);
  const isMultilineQuery = normalizedQuery.includes("\n");
  const queryLineCount = Math.max(1, query.split(/\r\n?|\n/).length);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-2 pb-1">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 size-3.5 text-muted-foreground" />
          <Textarea
            ref={searchInputRef}
            data-explorer-search-input
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                void performSearch(query);
              }
              if (!e.metaKey && !e.ctrlKey && !e.shiftKey && e.key === "Escape") {
                e.preventDefault();
                handleClear();
              }
            }}
            rows={Math.min(6, Math.max(1, isMultilineQuery ? queryLineCount : 1))}
            className="min-h-0 resize-none rounded-sm border-border/80 bg-background pl-8 pr-9 py-2 text-sm leading-5"
            placeholder="Search in files or paste a code block..."
            autoFocus
          />
          {query ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="absolute right-1.5 top-1.5 h-6 w-6 rounded-sm p-0 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </Button>
          ) : null}
        </div>
        <p className="px-0.5 pt-1 text-[11px] leading-4 text-muted-foreground">
          {isMultilineQuery
            ? "Exact multiline search enabled. Press Cmd/Ctrl+Enter to run immediately."
            : "Type to search. Paste multiple lines to search an exact code block."}
        </p>
      </div>

      {isSearching ? (
        <p className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Searching...
        </p>
      ) : null}

      {!isSearching && hasSearched && results.length === 0 && !error ? (
        <p className="px-2 py-2 text-sm text-muted-foreground">No results found.</p>
      ) : null}

      {error ? (
        <p className="px-2 py-2 text-sm text-destructive">{error}</p>
      ) : null}

      {!isSearching && results.length > 0 ? (
        <>
          <p className="px-2 pb-1 text-xs text-muted-foreground">
            {totalMatches.toLocaleString()} match{totalMatches !== 1 ? "es" : ""} in {results.length.toLocaleString()} file{results.length !== 1 ? "s" : ""}
            {limitHit ? " (result limit reached)" : ""}
          </p>
          <div className="min-h-0 flex-1 bg-sidebar">
            <Virtuoso
              totalCount={flatRows.length}
              increaseViewportBy={1200}
              className="[&>div]:bg-sidebar"
              itemContent={(index) => {
                const row = flatRows[index];
                if (!row) return null;
                if (row.kind === "file") {
                  const isCollapsed = collapsedFiles.has(row.file);
                  return (
                    <button
                      type="button"
                      onClick={() => toggleFileCollapse(row.file)}
                      className="flex h-7 w-full min-w-0 items-center gap-1.5 rounded-sm px-1.5 text-left text-sm hover:bg-secondary/60"
                    >
                      {isCollapsed
                        ? <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                        : <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />}
                      <File className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate font-medium">{row.fileName}</span>
                      {row.dirPath ? (
                        <span className="shrink-0 text-xs text-muted-foreground">{row.dirPath}</span>
                      ) : null}
                      <span className="ml-1 shrink-0 rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
                        {row.matchCount}
                      </span>
                    </button>
                  );
                }
                return (
                  <button
                    type="button"
                    onClick={() => props.onOpenFile(row.file, row.line)}
                    className="flex w-full min-w-0 items-start gap-2 rounded-sm px-1.5 py-1.5 text-left hover:bg-secondary/60"
                    style={{ paddingLeft: "24px" }}
                  >
                    <span className="mt-0.5 shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {row.lineCount > 1 ? `${row.line}-${row.line + row.lineCount - 1}` : row.line}
                    </span>
                    <span className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-muted-foreground">
                      {row.lineCount > 1 || isMultilineQuery
                        ? row.text
                        : highlightMatch(row.text, normalizedQuery)}
                    </span>
                  </button>
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
  const isFolder = args.entry.type === "folder";
  const isOpen = isFolder && args.expanded.has(args.entry.path);
  const directoryState = isFolder ? args.directoryStateByPath[args.entry.path] : undefined;
  const childEntries = directoryState?.entries ?? [];
  const parentDirectoryPath = isFolder ? args.entry.path : getParentDirectoryPath({ path: args.entry.path });
  const terminalTargetPath = isFolder ? args.entry.path : parentDirectoryPath;

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            type="button"
            onClick={() => (isFolder ? args.onToggle(args.entry.path) : args.onOpenFile(args.entry.path))}
            className="flex min-w-0 w-full items-center gap-1 rounded-sm px-1.5 py-1 text-left text-sm hover:bg-secondary/60"
            style={{ paddingLeft: `${6 + args.depth * 14}px` }}
          >
            {isFolder ? (
              isOpen
                ? <ChevronDown className="size-3.5 text-muted-foreground" />
                : <ChevronRight className="size-3.5 text-muted-foreground" />
            ) : (
              <span className="inline-block w-3.5" />
            )}
            <ExplorerEntryIcon entry={args.entry} isOpen={isOpen} />
            <span className="min-w-0 flex-1 truncate">{args.entry.name}</span>
            {isFolder && directoryState?.status === "loading" ? <LoaderCircle className="size-3.5 shrink-0 animate-spin text-muted-foreground" /> : null}
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          {isFolder ? (
            <ContextMenuItem onSelect={() => args.onToggle(args.entry.path)}>
              {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              {isOpen ? "Collapse folder" : "Expand folder"}
            </ContextMenuItem>
          ) : (
            <ContextMenuItem onSelect={() => args.onOpenFile(args.entry.path)}>
              <File className="size-4" />
              Open file
            </ContextMenuItem>
          )}
          <ContextMenuItem onSelect={() => args.onStartCreateFile(parentDirectoryPath)}>
            <FilePlus className="size-4" />
            New file here
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => args.onStartCreateFolder(parentDirectoryPath)}>
            <FolderPlus className="size-4" />
            New folder here
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => args.onCopyRelativePath(args.entry.path)}>
            <Copy className="size-4" />
            Copy relative path
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => args.onCopyAbsolutePath(args.entry.path)}>
            <Copy className="size-4" />
            Copy absolute path
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => args.onOpenInFinder(args.entry.path)}>
            <FolderOpen className="size-4" />
            Open in Finder
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => args.onOpenInVSCode(args.entry.path)}>
            <VSCodeIcon className="size-4" />
            Open in VS Code
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => args.onOpenInGhostty(terminalTargetPath)}>
            <GhosttyIcon className="size-4" />
            Open in Ghostty
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => args.onOpenInTerminal(terminalTargetPath)}>
            <SquareTerminal className="size-4" />
            Open in Terminal
          </ContextMenuItem>
          {isFolder ? (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => args.onRefreshDirectory(args.entry.path)}>
                <RefreshCcw className="size-4" />
                Refresh folder
              </ContextMenuItem>
            </>
          ) : null}
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            onSelect={() => (isFolder ? args.onRequestDeleteFolder(args.entry.path, args.entry.name) : args.onRequestDeleteFile(args.entry.path, args.entry.name))}
          >
            <Trash2 className="size-4" />
            {isFolder ? "Delete folder" : "Delete file"}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {isFolder && isOpen ? (
        <>
          {directoryState?.status === "error" ? (
            <p
              className="py-1 text-sm text-destructive"
              style={{ paddingLeft: `${24 + args.depth * 14}px` }}
            >
              {directoryState.error ?? "Failed to load folder."}
            </p>
          ) : null}
          {directoryState?.status === "ready" && childEntries.length === 0 ? (
            <p
              className="py-1 text-sm text-muted-foreground"
              style={{ paddingLeft: `${24 + args.depth * 14}px` }}
            >
              Empty
            </p>
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
  projectName: string;
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
    <div className="flex min-h-0 h-full flex-col px-3 py-2">
      <div className="mb-1 flex shrink-0 items-center justify-between gap-2">
        <p className="truncate text-sm text-muted-foreground">{props.projectName}</p>
        <div className="flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={`h-7 w-7 rounded-sm p-0 ${showSearch ? "bg-secondary text-foreground" : "text-muted-foreground"}`}
                  onClick={() => {
                    if (showSearch) {
                      setShowSearch(false);
                      return;
                    }
                    setShowSearch(true);
                    setSearchFocusNonce((nonce) => nonce + 1);
                  }}
                >
                  <Search className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Search in files</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 rounded-sm p-0 text-muted-foreground"
                  onClick={() => props.onStartExplorerCreate("file")}
                >
                  <FilePlus className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Add file</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 rounded-sm p-0 text-muted-foreground"
                  onClick={() => props.onStartExplorerCreate("folder")}
                >
                  <FolderPlus className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Add folder</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 rounded-sm p-0 text-muted-foreground"
                  onClick={props.onCollapseAllFolders}
                >
                  <ChevronsUp className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Collapse all</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 rounded-sm p-0 text-muted-foreground"
                  onClick={() => void props.onExpandAllFolders()}
                >
                  <ChevronsDown className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Expand all</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {showSearch ? (
        <div className="mb-2 min-h-0 flex-1">
          <ExplorerSearchPanel
            focusRequestNonce={searchFocusNonce}
            workspaceCwd={props.workspaceCwd}
            onOpenFile={props.onOpenExplorerFile}
          />
        </div>
      ) : null}

      {!showSearch && props.explorerError ? <p className="mb-1 shrink-0 text-sm text-destructive">{props.explorerError}</p> : null}
      {!showSearch ? <div className="min-h-0 flex-1 space-y-1 overflow-auto">
        {props.pendingExplorerCreate ? (
          <form
            className="rounded-sm border border-border/80 bg-muted/40 px-2 py-2"
            onSubmit={(event) => {
              event.preventDefault();
              void props.onSubmitExplorerCreate();
            }}
          >
            <div className="flex items-center gap-2">
              {props.pendingExplorerCreate.type === "file" ? (
                <FilePlus className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <FolderPlus className="size-4 shrink-0 text-muted-foreground" />
              )}
              <Input
                ref={props.pendingExplorerCreateInputRef}
                value={props.pendingExplorerCreatePath}
                onChange={(event) => props.onPendingExplorerCreatePathChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    props.onCancelExplorerCreate();
                  }
                }}
                className="h-8 rounded-sm border-border/80 bg-background px-2 text-sm"
                placeholder={props.pendingExplorerCreate.placeholder}
                aria-label={props.pendingExplorerCreate.type === "file" ? "New file path" : "New folder path"}
                disabled={props.isCreatingExplorerEntry}
              />
              <Button
                type="submit"
                size="sm"
                className="h-8 rounded-sm"
                disabled={props.isCreatingExplorerEntry}
              >
                {props.isCreatingExplorerEntry ? "Creating..." : "Create"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 rounded-sm px-2 text-muted-foreground"
                onClick={props.onCancelExplorerCreate}
                disabled={props.isCreatingExplorerEntry}
              >
                Cancel
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Enter a path relative to the project root. Press Enter to create or Esc to cancel.
            </p>
          </form>
        ) : null}
        {props.isExplorerLoading && props.explorerTree.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Loading files...
          </p>
        ) : null}
        {!props.explorerError && !props.isExplorerLoading && props.explorerTree.length === 0 ? <p className="text-sm text-muted-foreground">No files found.</p> : null}
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
      </div> : null}
    </div>
  );
}
