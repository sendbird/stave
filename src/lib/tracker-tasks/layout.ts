/**
 * How the filtered ticket set is laid out.
 *
 * List is the row surface. Board is one column per status category. Both share
 * the same filters, sort, and peek; grouping is list-only because the board
 * already is a status grouping.
 */
export const TRACKER_TASK_LAYOUTS = ["list", "board"] as const;
export type TrackerTaskLayout = (typeof TRACKER_TASK_LAYOUTS)[number];
