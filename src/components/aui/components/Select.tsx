import { SelectArray } from "./Select.array";
import { selectCompoundParts } from "./Select.parts";

export type * from "./Select.array";
export type * from "./Select.parts";

/**
 * Select supports two coexisting APIs (non-breaking):
 *
 * - **Array (convenience):** `<Select options={[…]} />` — see `Select.array`.
 * - **Compound (compositional):** `<Select.Root>…<Select.Trigger render={…}/>…</Select.Root>`
 *   — see `Select.parts`.
 *
 * The compound namespace is attached via `Object.assign`, so both call styles
 * resolve through the same `Select` export. This module is only the join: the
 * two halves live in siblings so neither outgrows the source-size cap.
 */
export const Select = Object.assign(SelectArray, selectCompoundParts);
