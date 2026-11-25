import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { resolveLiveEdge, type LiveEdgeState } from "@/components/aui/components/Thread.liveEdge";
import { countUnseenSteps, type AgentStep } from "@/lib/agent-progress";

/**
 * Follows the newest step only while the reader is at the bottom. Scrolling
 * up releases it and remembers the steps on screen; anything after them is
 * counted as new until the reader jumps back down. A live agent opens at its
 * newest step, a settled one at its ask.
 */
export function useFollowBottom(args: { steps: readonly AgentStep[]; live: boolean; resetKey: string }) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const edgeRef = useRef<LiveEdgeState>({ atBottom: args.live, following: args.live });
  const previousRef = useRef({ height: 0, top: 0 });
  const stepsRef = useRef(args.steps);
  stepsRef.current = args.steps;
  const [edge, setEdge] = useState<LiveEdgeState>(edgeRef.current);
  const [seen, setSeen] = useState<ReadonlySet<string> | null>(null);

  const commit = useCallback((next: LiveEdgeState) => {
    const current = edgeRef.current;
    if (current.atBottom === next.atBottom && current.following === next.following) return;
    edgeRef.current = next;
    setEdge(next);
    // Leaving the bottom fixes what the reader has seen; returning clears it.
    setSeen(next.following ? null : new Set(stepsRef.current.map((step) => step.id)));
  }, []);

  const scrollToBottom = useCallback((smooth: boolean) => {
    const node = viewportRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    previousRef.current = { height: node.scrollHeight, top: node.scrollTop };
  }, []);

  // Read at reset only: a status change must not move the reader.
  const liveRef = useRef(args.live);
  liveRef.current = args.live;

  // A new agent starts over: live ones at the bottom, settled ones at the top.
  useLayoutEffect(() => {
    const node = viewportRef.current;
    const following = liveRef.current;
    edgeRef.current = { atBottom: following, following };
    setEdge(edgeRef.current);
    setSeen(null);
    if (!node) return;
    if (following) scrollToBottom(false);
    else node.scrollTop = 0;
    previousRef.current = { height: node.scrollHeight, top: node.scrollTop };
  }, [args.resetKey, scrollToBottom]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (edgeRef.current.following) {
        scrollToBottom(false);
        return;
      }
      const node = viewportRef.current;
      if (node) previousRef.current = { height: node.scrollHeight, top: node.scrollTop };
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [scrollToBottom]);

  const onScroll = useCallback(() => {
    const node = viewportRef.current;
    if (!node) return;
    const previous = previousRef.current;
    const next = resolveLiveEdge({
      clientHeight: node.clientHeight,
      following: edgeRef.current.following,
      previousHeight: previous.height,
      previousTop: previous.top,
      scrollHeight: node.scrollHeight,
      scrollTop: node.scrollTop,
    });
    previousRef.current = { height: node.scrollHeight, top: node.scrollTop };
    commit(next);
  }, [commit]);

  const jumpToLatest = useCallback(() => {
    commit({ atBottom: true, following: true });
    scrollToBottom(true);
  }, [commit, scrollToBottom]);

  return {
    viewportRef,
    contentRef,
    onScroll,
    jumpToLatest,
    following: edge.following,
    newStepCount: edge.following ? 0 : countUnseenSteps(seen, args.steps),
  };
}
