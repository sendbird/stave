import { useState } from "react";

/**
 * Disclosure group — the one expanded/collapsed model for a set of rows that
 * open independently AND can all be opened or folded at once. `StateTimeline`,
 * `TraceWaterfall`, `JsonViewer` and `StackTrace` (its library-frame runs) all
 * read it, so "Expand all" means the same thing on every evidence surface. That
 * is the point of the module: `StateTimeline` had the only expand/collapse-all
 * in the system, and giving the other three their own copy is how four
 * subtly different answers to "what does Collapse all fold?" get shipped.
 *
 * Where it sits next to its two neighbours:
 *
 * - `Accordion` is Base UI's disclosure for authored sections. Base UI owns its
 *   state (`value` / `multiple`), and ADS never hand-rolls what a headless
 *   primitive owns — a host that wants "expand all" on an Accordion drives its
 *   controlled `value`.
 * - `Tree` is the APG treeview. It owns roving focus and a controlled
 *   `expandedIds` API, and `*` opens siblings per the pattern. It is a
 *   navigation control, not an evidence surface, and it keeps its own state.
 * - This module is for read-only evidence rows whose ids the surface can
 *   enumerate but whose set may change under it — spans stream into a running
 *   trace, a source filter hides timeline entries, a new response body
 *   replaces the old one.
 *
 * The model is a RULE plus EXCEPTIONS rather than a set of open ids, because
 * the rule is what a row that has never been seen needs. Until a bulk action,
 * each row follows the surface's own `defaultExpanded` (a depth limit, a list
 * of ids, "open unless listed as collapsed"). A row the reader toggles records
 * an exception. `expandAll` / `collapseAll` replace the rule for EVERY row of
 * the group — including rows that arrive later or are filtered out right now —
 * and clear the exceptions. So a span that streams in after "Collapse all"
 * arrives collapsed, and one that arrives after "Expand all" arrives open.
 *
 * A surface's own container — the JSON document root, the StackTrace frames
 * panel — is not a row of the group. "Expand all" must reveal it, and
 * "Collapse all" leaves it as it is; the surface owns that state itself.
 *
 * Search (D1) reveals through `setExpanded(id, true)` on the ancestors of the
 * ACTIVE match only, the rule `LogViewer`'s find already ships: bulk-opening
 * every match would be an implicit "Expand all" on each keystroke, and folding
 * rows back when the cursor moves on would move content under the reader.
 */

type Rule = "default" | "expanded" | "collapsed";

type DisclosureState = {
  exceptions: ReadonlyMap<string, boolean>;
  rule: Rule;
};

export type DisclosureGroupOptions = {
  /**
   * Whether a row that has not been toggled starts open. Consulted until the
   * first `expandAll` / `collapseAll` replaces it.
   */
  defaultExpanded: (id: string) => boolean;
  /**
   * The rows the bulk toggle speaks for right now — what `allExpanded` is
   * computed over. A surface passes the rows a reader can reach: the entries
   * its filter shows, every parent span, every nested JSON value.
   */
  ids: readonly string[];
};

export type DisclosureGroup = {
  /** Every row in `ids` is open (and there is at least one). */
  allExpanded: boolean;
  /** Fold every row of the group. */
  collapseAll: () => void;
  /** Open every row of the group. */
  expandAll: () => void;
  isExpanded: (id: string) => boolean;
  setExpanded: (id: string, open: boolean) => void;
  toggle: (id: string) => void;
  /** `collapseAll` when `allExpanded`, otherwise `expandAll`. */
  toggleAll: () => void;
};

/**
 * The fewest rows a bulk toggle is shown for. With one row, the row's own
 * chevron already IS the whole toggle, and a second control doing the same
 * thing is noise.
 */
export const DISCLOSURE_GROUP_MIN_ROWS = 2;

function resolve(
  state: DisclosureState,
  defaultExpanded: (id: string) => boolean,
  id: string,
): boolean {
  const exception = state.exceptions.get(id);
  if (exception !== undefined) return exception;
  if (state.rule === "default") return defaultExpanded(id);
  return state.rule === "expanded";
}

export function useDisclosureGroup({
  defaultExpanded,
  ids,
}: DisclosureGroupOptions): DisclosureGroup {
  const [state, setState] = useState<DisclosureState>(() => ({
    exceptions: new Map(),
    rule: "default",
  }));

  const isExpanded = (id: string) => resolve(state, defaultExpanded, id);
  const allExpanded = ids.length > 0 && ids.every(isExpanded);

  const setExpanded = (id: string, open: boolean) =>
    setState((current) => {
      if (resolve(current, defaultExpanded, id) === open) return current;
      const exceptions = new Map(current.exceptions);
      exceptions.set(id, open);
      return { ...current, exceptions };
    });
  const toggle = (id: string) =>
    setState((current) => {
      const exceptions = new Map(current.exceptions);
      exceptions.set(id, !resolve(current, defaultExpanded, id));
      return { ...current, exceptions };
    });
  const expandAll = () => setState({ exceptions: new Map(), rule: "expanded" });
  const collapseAll = () =>
    setState({ exceptions: new Map(), rule: "collapsed" });

  return {
    allExpanded,
    collapseAll,
    expandAll,
    isExpanded,
    setExpanded,
    toggle,
    toggleAll: allExpanded ? collapseAll : expandAll,
  };
}
