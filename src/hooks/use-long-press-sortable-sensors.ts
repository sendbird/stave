import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

/**
 * Delay before a press-and-hold begins a drag on a "long-press to reorder"
 * sortable row. Short taps/clicks under this threshold (or that move beyond
 * `tolerance`) pass through untouched so the row's own click/toggle behavior
 * still works.
 */
const LONG_PRESS_ACTIVATION_CONSTRAINT = { delay: 220, tolerance: 6 } as const;

/**
 * Shared sensor set for sortable lists that reorder via press-and-hold
 * instead of a dedicated drag handle. Pairs a delayed `PointerSensor` with a
 * `KeyboardSensor` so keyboard and screen-reader users retain a way to
 * reorder items — pointer-only sensors leave no accessible fallback once the
 * explicit drag-handle button is removed from the row.
 */
export function useLongPressSortableSensors() {
  return useSensors(
    useSensor(PointerSensor, {
      activationConstraint: LONG_PRESS_ACTIVATION_CONSTRAINT,
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
}
