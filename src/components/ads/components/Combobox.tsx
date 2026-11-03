import { ComboboxArray } from "./Combobox.array";
import { ComboboxPagedList } from "./Combobox.pagedList";
import { compoundParts } from "./Combobox.parts";

export type * from "./Combobox.array";
export type { ComboboxPagedListProps } from "./Combobox.pagedList";
/**
 * The string behind an option — its `text`, or its `label` when that is
 * already a string. Exported because a caller passing a node `label` needs the
 * same fallback ADS uses internally (typeahead, chip labels, `itemToStringLabel`
 * on the compound API).
 */
export { optionText } from "./Combobox.options";
export type * from "./Combobox.parts";

/**
 * Combobox supports two coexisting APIs (non-breaking):
 *
 * - **Array (convenience):** `<Combobox options={[…]} />` — see `Combobox.array`.
 * - **Compound (compositional):** `<Combobox.Root>…<Combobox.Trigger render={…}/>…</Combobox.Root>`
 *   — see `Combobox.parts`.
 *
 * The compound namespace is attached via `Object.assign`, so both call styles
 * resolve through the same `Combobox` export. This module is only the join:
 * the two halves live in siblings so neither outgrows the source-size cap.
 */
export const Combobox = Object.assign(ComboboxArray, compoundParts, {
  /** `List` with the array API's paging — see `Combobox.pagedList`. */
  PagedList: ComboboxPagedList,
});
