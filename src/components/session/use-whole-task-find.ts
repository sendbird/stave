import { mergeWholeTaskFindResults, retainFindSelection } from "@/lib/task-search/whole-task-find-results";
import type { ChatMessage } from "@/types/chat";
import { useEffect, useRef, useState } from "react";
import { searchTaskContent } from "@/lib/db/content-search.db";
import type { ContentSearchResult } from "@/lib/task-search/content-search";

const PAGE_SIZE = 50;
interface FindPage {
  status: "idle" | "searching" | "ready" | "error";
  results: ContentSearchResult[];
  offset: number;
  nextOffset: number | null;
  selected: number;
}
const EMPTY: FindPage = {
  status: "idle",
  results: [],
  offset: 0,
  nextOffset: null,
  selected: -1,
};

/** Bounded pages from the same local index used by cross-task search. */
export function useWholeTaskFind(args: {
  taskId: string;
  workspaceId: string | null;
  query: string;
  enabled: boolean;
  messages: ChatMessage[];
}) {
  const [page, setPage] = useState<FindPage>(EMPTY);
  const pageRef = useRef(page);
  pageRef.current = page;
  const messagesRef=useRef(args.messages);
  messagesRef.current=args.messages;
  const generation = useRef(0);
  useEffect(() => {
    const request = ++generation.current;
    if (!args.enabled || args.query.trim().length < 2 || !args.workspaceId) {
      setPage(EMPTY);
      return;
    }
    setPage({ ...EMPTY, status: "searching" });
    let timer = window.setTimeout(run, 120);
    let waiting=false;
    async function run() {
      const requestedOffset=pageRef.current.offset;
      try {
        const response = await searchTaskContent({
          query: args.query.trim(),
          workspaceId: args.workspaceId!,
          taskId: args.taskId,
          limit: PAGE_SIZE,
          offset: requestedOffset,
          ...(waiting ? {statusOnly:true}:{}),
        });
        if (request !== generation.current) return;
        if (!response.ok) {
          setPage({ ...EMPTY, status: "error" });
          return;
        }
        if(waiting && !response.indexing.complete) {timer=window.setTimeout(run,1000);return;}
        if(waiting) {waiting=false;void run();return;}
        if(requestedOffset!==pageRef.current.offset) {void run();return;}
        const previous=pageRef.current;
        const results=mergeWholeTaskFindResults(response.results,messagesRef.current,args.query,args.taskId,args.workspaceId ?? "");
        setPage({
          status: "ready",
          results,
          nextOffset: response.nextOffset,
          offset: previous.offset,
          selected: retainFindSelection(previous,results),
        });
        if (!response.indexing.complete) {waiting=true;timer=window.setTimeout(run,1000);}
      } catch {
        if (request === generation.current)
          setPage({ ...EMPTY, status: "error" });
      }
    }
    return () => {
      generation.current += 1;
      window.clearTimeout(timer);
    };
  }, [args.enabled, args.query, args.taskId, args.workspaceId]);

  const merged=mergeWholeTaskFindResults(page.results,args.messages,args.query,args.taskId,args.workspaceId ?? "");
  pageRef.current={...page,results:merged,selected:retainFindSelection(pageRef.current,merged)};
  async function step(backward: boolean): Promise<ContentSearchResult | null> {
    const current = pageRef.current;
    if (!current.results.length || current.status === "searching") return null;
    let selected = current.selected + (backward ? -1 : 1);
    if (current.selected < 0)
      selected = backward ? current.results.length - 1 : 0;
    let next = current;
    if (selected >= current.results.length || selected < 0) {
      const offset = backward
        ? Math.max(0, current.offset - PAGE_SIZE)
        : (current.nextOffset ?? 0);
      const request = generation.current;
      try {
        const response = await searchTaskContent({
          query: args.query.trim(),
          workspaceId: args.workspaceId!,
          taskId: args.taskId,
          limit: PAGE_SIZE,
          offset,
        });
        if (
          request !== generation.current ||
          !response.ok ||
          !response.results.length
        )
          return null;
        next = {
          status: "ready",
          results: response.results,
          offset,
          nextOffset: response.nextOffset,
          selected: -1,
        };
        selected = backward ? next.results.length - 1 : 0;
      } catch {
        return null;
      }
    }
    next = { ...next, selected };
    pageRef.current = next;
    setPage(next);
    return next.results[selected] ?? null;
  }
  return {
    ...page,
    results: merged,
    position: pageRef.current.selected < 0 ? 0 : page.offset + pageRef.current.selected + 1,
    step,
  };
}
