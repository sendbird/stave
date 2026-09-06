import { useEffect, useState, useSyncExternalStore } from "react";
import { useAppStore } from "@/store/app.store";
import type { ListResultReviewsArgs, ResultReviewPage } from "./result-review";
import {
  getResultReviewRevision,
  invalidateResultReviews,
  listResultReviews,
  subscribeResultReviews,
} from "./result-review-client";

const EMPTY: ResultReviewPage = { results: [], total: 0, hasMore: false };

export function useResultReviews(args: ListResultReviewsArgs = {}) {
  const key = JSON.stringify(args);
  const revision = useSyncExternalStore(
    subscribeResultReviews,
    getResultReviewRevision,
    getResultReviewRevision,
  );
  const notifications = useAppStore((state) => state.notifications);
  const [state, setState] = useState({
    key,
    page: EMPTY,
    loading: true,
    error: "",
  });
  useEffect(() => {
    let cancelled = false;
    setState((current) => ({
      key,
      page: current.key === key ? current.page : EMPTY,
      loading: true,
      error: "",
    }));
    void listResultReviews(JSON.parse(key) as ListResultReviewsArgs).then(
      (page) => {
        if (!cancelled) setState({ key, page, loading: false, error: "" });
      },
      (error: unknown) => {
        if (!cancelled)
          setState((current) => ({
            ...current,
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : "Could not load result reviews.",
          }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, revision, notifications]);
  useEffect(() => {
    const refresh = () => invalidateResultReviews();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  return state.key === key
    ? { ...state, refresh: invalidateResultReviews }
    : {
        key,
        page: EMPTY,
        loading: true,
        error: "",
        refresh: invalidateResultReviews,
      };
}
