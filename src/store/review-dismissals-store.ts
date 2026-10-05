import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { REVIEW_SHELF_SETTLED_TTL_MS } from "@/lib/reviews/review-task";

export interface ReviewDismissalScope {
  repositoryPath: string;
  workspaceId: string;
  taskId: string;
}

export type ReviewDismissals = Readonly<Record<string, number>>;
type DismissalsByScope = Readonly<Record<string, ReviewDismissals>>;

interface ReviewDismissalsState {
  dismissedReviewsByScope: DismissalsByScope;
  /** Returns false if the dismissal could only be applied for this session. */
  dismissReview: (args: ReviewDismissalScope & { delegationKey: string }) => boolean;
}

export function reviewDismissalScopeKey(scope: ReviewDismissalScope) {
  return JSON.stringify([scope.repositoryPath, scope.workspaceId, scope.taskId]);
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function validScopeKey(key: string) {
  try {
    const parts: unknown = JSON.parse(key);
    return Array.isArray(parts) && parts.length === 3 &&
      parts.every((part) => typeof part === "string" && part.trim() && part.length <= 4096);
  } catch {
    return false;
  }
}

function normalizeDismissals(value: unknown, now: number): DismissalsByScope {
  const scopes = Object.entries(record(value) ?? {}).flatMap(([scope, entries]) => {
    if (!validScopeKey(scope)) return [];
    const live = Object.entries(record(entries) ?? {}).filter(([key, dismissedAt]) =>
      key.length > 0 && key.length <= 512 && typeof dismissedAt === "number" &&
      Number.isFinite(dismissedAt) && dismissedAt <= now &&
      now - dismissedAt <= REVIEW_SHELF_SETTLED_TTL_MS,
    );
    return live.length ? [[scope, Object.fromEntries(live)]] : [];
  });
  return Object.fromEntries(scopes);
}

/** Lightweight UI preferences use the same synchronous storage as other UI stores. */
const browserStorage: StateStorage = {
  getItem: (name) => typeof window === "undefined" ? null : window.localStorage?.getItem?.(name) ?? null,
  setItem: (name, value) => {
    if (typeof window === "undefined" || typeof window.localStorage?.setItem !== "function") {
      throw new Error("Review dismissal storage is unavailable.");
    }
    window.localStorage.setItem(name, value);
  },
  removeItem: (name) => { if (typeof window !== "undefined") window.localStorage?.removeItem?.(name); },
};

export function createReviewDismissalsStore(options: {
  storage?: StateStorage;
  now?: () => number;
} = {}) {
  const now = options.now ?? Date.now;
  return create<ReviewDismissalsState>()(
    persist(
      (set) => ({
        dismissedReviewsByScope: {},
        dismissReview: ({ delegationKey, ...scope }) => {
          const scopeKey = reviewDismissalScopeKey(scope);
          if (!validScopeKey(scopeKey) || !delegationKey || delegationKey.length > 512) return false;
          try {
            set((state) => {
              const timestamp = now();
              const current = normalizeDismissals(state.dismissedReviewsByScope, timestamp);
              return {
                dismissedReviewsByScope: {
                  ...current,
                  [scopeKey]: { ...current[scopeKey], [delegationKey]: timestamp },
                },
              };
            });
            return true;
          } catch {
            // Zustand has already hidden the row. Keep that choice for the
            // session and let the caller explain that persistence failed.
            return false;
          }
        },
      }),
      {
        name: "stave:review-dismissals",
        storage: createJSONStorage(() => options.storage ?? browserStorage),
        partialize: (state) => ({ dismissedReviewsByScope: state.dismissedReviewsByScope }),
        merge: (saved, current) => ({
          ...current,
          dismissedReviewsByScope: normalizeDismissals(record(saved)?.dismissedReviewsByScope, now()),
        }),
      },
    ),
  );
}

// Synchronous hydration finishes before a shelf can render its first rows.
export const useReviewDismissalsStore = createReviewDismissalsStore();
