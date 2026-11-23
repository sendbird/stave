import * as stylex from "@stylexjs/stylex";
import { sx } from "@/components/aui/utils/stylex";
import { correctAnchorScrollTop } from "@/components/ai-elements/conversation-scroll-anchor";
import { Component, createRef, type ReactNode } from "react";

type AnchorSnapshot = {
  scroller: HTMLElement;
  candidates: { key: string; top: number }[];
};

/**
 * Virtuoso compensates for height changes in earlier messages. When the reader
 * is inside the changing message, keep a surviving trace row or the reply at
 * its previous position through the height change.
 */
export class TraceScrollAnchor extends Component<{
  layoutKey: string;
  revealing: boolean;
  children: ReactNode;
}, object, AnchorSnapshot | null> {
  private root = createRef<HTMLDivElement>();

  getSnapshotBeforeUpdate(previous: Readonly<typeof this.props>): AnchorSnapshot | null {
    if (previous.layoutKey === this.props.layoutKey || this.props.revealing) return null;
    const root = this.root.current;
    const scroller = root?.closest<HTMLElement>("[data-transcript-scroller]");
    if (!root || !scroller) return null;
    const viewport = scroller.getBoundingClientRect();
    const bounds = root.closest("[data-message-id]")?.getBoundingClientRect();
    if (
      !bounds || bounds.top > viewport.top || bounds.bottom <= viewport.top ||
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 1
    ) return null;

    const candidates = Array.from(root.querySelectorAll<HTMLElement>("[data-trace-anchor]"))
      .flatMap((node) => {
        const { top, bottom } = node.getBoundingClientRect();
        const key = node.dataset.traceAnchor;
        return key && bottom > viewport.top && top < viewport.bottom ? [{ key, top }] : [];
      });
    return { scroller, candidates };
  }

  componentDidUpdate(_props: Readonly<typeof this.props>, _state: object, snapshot: AnchorSnapshot | null) {
    if (!snapshot?.candidates.length) return;
    const { scroller, candidates } = snapshot;
    const nodes = new Map(Array.from(
      this.root.current?.querySelectorAll<HTMLElement>("[data-trace-anchor]") ?? [],
      (node) => [node.dataset.traceAnchor, node],
    ));
    for (const { key, top } of candidates) {
      const node = nodes.get(key);
      if (node && node.getClientRects().length > 0) {
        scroller.scrollTop = correctAnchorScrollTop({
          scrollTop: scroller.scrollTop,
          anchorTopBefore: top,
          anchorTopNow: node.getBoundingClientRect().top,
          maxScrollTop: scroller.scrollHeight - scroller.clientHeight,
        });
        break;
      }
    }
  }

  render() {
    return <div ref={this.root} className={sx(styles.contents)}>{this.props.children}</div>;
  }
}

const styles = stylex.create({
  contents: { display: "contents" },
});
