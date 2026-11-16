import { useEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { i18n, useTranslation } from "@/i18n";
import { formatTimeAgo } from "@/i18n/format";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { Button } from "@/components/aui/components/Button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/aui/components/Table";
import { Badge, CommandGroup, CommandItem } from "@/components/ui";
import { SearchHighlight } from "@/components/system/SearchHighlight";
import { searchTaskContent } from "@/lib/db/content-search.db";
import type { ContentSearchResult, SearchTaskContentResponse } from "@/lib/task-search/content-search";
import { useAppStore } from "@/store/app.store";
import { describeTaskSearchPlace, describeTaskSearchState } from "./command-palette-task-search";
import { commandPaletteStyles } from "./global-command-palette.styles";

export interface ContentSearchState {
  status: "idle" | "searching" | "ready" | "error";
  results: ContentSearchResult[];
  indexing?: Extract<SearchTaskContentResponse, { ok: true }>["indexing"];
  nextOffset: number | null;
}
const EMPTY: ContentSearchState = { status: "idle", results: [], nextOffset: null };

/** Query generations invalidate both timers and in-flight responses, including unmount. */
export function useContentSearch(args: { query: string; enabled: boolean; workspaceId?: string }) {
  const [state, setState] = useState<ContentSearchState>(EMPTY);
  const [offset, setOffset] = useState(0);
  const generation = useRef(0);
  const query = args.query.trim();
  useEffect(() => setOffset(0), [query, args.workspaceId, args.enabled]);
  useEffect(() => {
    const request = ++generation.current;
    if (!args.enabled || query.length < 2) {
      setState(EMPTY);
      return;
    }
    setState({ status: "searching", results: [], nextOffset: null });
    let refresh: number | undefined;
    const read = () => {
      void searchTaskContent({ query, limit: 20, offset, ...(args.workspaceId ? { workspaceId: args.workspaceId } : {}) })
        .then((response) => {
          if (generation.current !== request) return;
          setState(response.ok
            ? { status: "ready", results: response.results, indexing: response.indexing, nextOffset: response.nextOffset }
            : { status: "error", results: [], nextOffset: null });
          if (response.ok && !response.indexing.complete) refresh = window.setTimeout(read, 500);
        })
        .catch(() => {
          if (generation.current === request) setState({ status: "error", results: [], nextOffset: null });
        });
    };
    const timer = window.setTimeout(read, 120);
    return () => { generation.current += 1; window.clearTimeout(timer); window.clearTimeout(refresh); };
  }, [args.enabled, args.workspaceId, query, offset]);
  return { ...state, nextPage: () => { if (state.nextOffset !== null) setOffset(state.nextOffset); }, firstPage: () => setOffset(0), offset };
}

export function openContentSearchResult(result: ContentSearchResult, query = "") {
  void useAppStore.getState().focusTaskAttention({
    taskId: result.taskId, workspaceId: result.workspaceId,
    repositoryPath: result.repositoryPath, searchQuery: query, ...(result.messageId ? { messageId: result.messageId, searchSnippet: result.snippet } : {}),
  });
}

function contentSearchStatus(search: ContentSearchState) {
  if (search.status === "searching") return i18n.t("shell:contentSearch.searching");
  if (search.status === "error") return i18n.t("shell:contentSearch.failed");
  if (search.indexing && !search.indexing.complete) return i18n.t("shell:contentSearch.indexing", search.indexing);
  if (search.results.length === 0) return i18n.t("shell:contentSearch.noMatch");
  return null;
}

export function ContentSearchDetails({ result, query }: { result: ContentSearchResult; query: string }) {
  const { t } = useTranslation(["shell"]);
  return <div className={sx(styles.details)}>
    <div className={sx(styles.titleRow)}>
      <span className={sx(styles.title)}>{result.title.trim() || t("shell:taskSearch.untitled")}</span>
      <Badge variant="secondary">{describeTaskSearchState(result)}</Badge>
      {result.parentTaskId ? <Badge variant="outline">{t("shell:contentSearch.delegated")}</Badge> : null}
    </div>
    <p className={sx(styles.snippet)} data-content-search-snippet=""><SearchHighlight text={result.snippet} query={query} /></p>
    <div className={sx(styles.metadata)}>
      <span className={sx(styles.place)} title={describeTaskSearchPlace(result)}>{describeTaskSearchPlace(result)}</span>
      <span className={sx(styles.timestamp)}>{t("shell:contentSearch.matches", { count: result.matchCount })}</span>
      <time className={sx(styles.timestamp)} dateTime={result.updatedAt} title={result.updatedAt}>{formatTimeAgo(result.updatedAt)}</time>
    </div>
  </div>;
}

/** Return actual Command elements because the palette walks its children to register items. */
export function renderContentSearchGroup(props: { search: ContentSearchState; query: string; onOpen: (result: ContentSearchResult) => void }) {
  if (props.search.status === "idle") return null;
  const notice = contentSearchStatus(props.search);
  if (props.search.results.length === 0) return <div className={sx(commandPaletteStyles.group)}>
    <p className={sx(commandPaletteStyles.searchHeading)}>{i18n.t("shell:contentSearch.heading")}</p>
    <p role="status" className={sx(commandPaletteStyles.searchNotice)}>{notice}</p>
  </div>;
  return <CommandGroup heading={i18n.t("shell:contentSearch.heading")} className={sx(commandPaletteStyles.group)}>
    {notice ? <p className={sx(commandPaletteStyles.searchNotice)} role="status">{notice}</p> : null}
    {props.search.results.flatMap((result) => [<CommandItem
      key={`${result.workspaceId}:${result.taskId}`} value={`content-search:${result.workspaceId}:${result.taskId}`}
      onSelect={() => props.onOpen(result)} className={sx(styles.paletteItem)} data-content-search-result=""
      aria-label={i18n.t("shell:contentSearch.openResult", { title: result.title, count: result.matchCount })}
    ><ContentSearchDetails result={result} query={props.query} /></CommandItem>,
      ...(result.parentTaskId ? [<CommandItem key={`parent:${result.workspaceId}:${result.taskId}`}
        value={`content-search-parent:${result.workspaceId}:${result.taskId}`} className={sx(styles.parentItem)}
        onSelect={() => props.onOpen({ ...result, taskId: result.parentTaskId!, workspaceId: result.parentWorkspaceId ?? result.workspaceId, repositoryPath: result.parentRepositoryPath ?? result.repositoryPath, messageId: "", snippet: "" })}>
        {i18n.t("shell:contentSearch.openParent")}
      </CommandItem>] : []),
    ])}
  </CommandGroup>;
}

export function FleetContentSearchResults(props: { search: ReturnType<typeof useContentSearch>; query: string }) {
  const { t } = useTranslation(["shell"]);
  if (props.search.status === "idle") return null;
  const notice = contentSearchStatus(props.search);
  return <section className={sx(styles.fleetResults)} aria-label={t("shell:contentSearch.heading")} data-fleet-content-results="">
    {notice ? <p role="status" className={sx(styles.notice)}>{notice}</p> : null}
    {props.search.results.length > 0 ? <Table density="compact">
      <TableHeader><TableRow><TableHead>{t("shell:contentSearch.heading")}</TableHead></TableRow></TableHeader>
      <TableBody>{props.search.results.map((result) => <TableRow key={`${result.workspaceId}:${result.taskId}`}>
        <TableCell><Button layout="host" variant="quiet" xstyle={styles.resultButton} onClick={() => openContentSearchResult(result, props.query)}
          aria-label={t("shell:contentSearch.openResult", { title: result.title, count: result.matchCount })}>
          <ContentSearchDetails result={result} query={props.query} />
        </Button>{result.parentTaskId ? <Button size="sm" variant="quiet" onClick={() => {
          void useAppStore.getState().focusTaskAttention({ taskId: result.parentTaskId!, workspaceId: result.parentWorkspaceId ?? result.workspaceId, repositoryPath: result.parentRepositoryPath ?? result.repositoryPath, searchQuery: props.query });
        }}>{t("shell:contentSearch.openParent")}</Button> : null}</TableCell>
      </TableRow>)}</TableBody>
    </Table> : null}
    {props.search.offset > 0 ? <Button size="sm" variant="quiet" onClick={props.search.firstPage}>{t("shell:contentSearch.firstPage")}</Button> : null}
    {props.search.nextOffset !== null ? <Button size="sm" variant="quiet" onClick={props.search.nextPage}>{t("shell:contentSearch.nextPage")}</Button> : null}
  </section>;
}

const styles = stylex.create({
  details: { display: "flex", flexDirection: "column", gap: vars["--aui-space-4"], minWidth: 0, flexGrow: 1 },
  titleRow: { display: "flex", alignItems: "center", gap: vars["--aui-space-8"], minWidth: 0 },
  title: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, fontWeight: vars["--aui-font-weight-medium"] },
  snippet: { margin: 0, whiteSpace: "normal", overflowWrap: "anywhere", color: vars["--aui-color-text"], fontSize: vars["--aui-font-size-caption"] },
  metadata: { display: "flex", minWidth: 0, gap: vars["--aui-space-8"] },
  timestamp: { flexShrink: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"] },
  place: { color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"], overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  parentItem: { color: vars["--aui-color-text-muted"], paddingInline: vars["--aui-space-12"], paddingBlock: vars["--aui-space-4"], fontSize: vars["--aui-font-size-caption"] },
  paletteItem: { alignItems: "flex-start", minWidth: 0, paddingBlock: vars["--aui-space-8"], paddingInline: vars["--aui-space-12"] },
  fleetResults: { minWidth: 0, paddingBlock: vars["--aui-space-8"], paddingInline: vars["--aui-space-16"] },
  resultButton: { display: "flex", textAlign: "start", width: "100%", minWidth: 0, padding: vars["--aui-space-8"] },
  notice: { margin: 0, paddingBlock: vars["--aui-space-8"], color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"] },
});
