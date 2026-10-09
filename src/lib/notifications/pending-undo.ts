import type { ReactNode } from "react";
import { toast } from "@/lib/notifications/toast";

/**
 * Undo offers that are still on screen. A toast with an Undo button registers
 * here while it is showing, so Cmd/Ctrl+Z outside a text field can run the
 * newest one. Closing the toast (timeout, dismiss, or its own button) removes
 * the offer.
 */
interface PendingUndo {
  id: string;
  run: () => void;
}

const pendingUndos: PendingUndo[] = [];

/** Register an undo offer; returns a function that withdraws it. */
export function registerPendingUndo(undo: PendingUndo): () => void {
  withdrawPendingUndo(undo.id);
  pendingUndos.push(undo);
  return () => withdrawPendingUndo(undo.id);
}

export function withdrawPendingUndo(id: string) {
  const index = pendingUndos.findIndex((undo) => undo.id === id);
  if (index >= 0) {
    pendingUndos.splice(index, 1);
  }
}

export function hasPendingUndo() {
  return pendingUndos.length > 0;
}

/**
 * Run the newest pending undo and withdraw it. Returns false when nothing is
 * pending, so the key press keeps its default meaning.
 */
export function runPendingUndo(): boolean {
  const undo = pendingUndos.pop();
  if (!undo) {
    return false;
  }
  undo.run();
  return true;
}

/** Test seam: forget every pending undo. */
export function clearPendingUndos() {
  pendingUndos.length = 0;
}

/**
 * Show a toast with an Undo button and register it for Cmd/Ctrl+Z. The undo
 * runs once, whichever way it is triggered, and the toast closes with it.
 */
export function offerUndoToast(
  title: ReactNode,
  options: {
    undoLabel: ReactNode;
    onUndo: () => void;
    description?: ReactNode;
  },
): string {
  const id = crypto.randomUUID();
  let done = false;
  const undo = () => {
    if (done) {
      return;
    }
    done = true;
    withdrawPendingUndo(id);
    options.onUndo();
  };
  registerPendingUndo({
    id,
    run: () => {
      undo();
      toast.dismiss(id);
    },
  });
  return toast(title, {
    id,
    description: options.description,
    action: { label: options.undoLabel, onClick: undo },
    onClose: () => withdrawPendingUndo(id),
  });
}
