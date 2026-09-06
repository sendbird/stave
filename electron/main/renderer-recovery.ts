export type RendererFailure = "unresponsive" | "crashed";

/** Native recovery survives the renderer it is recovering. Never restarts a turn. */
export function createRendererRecovery(actions: {
  isDestroyed: () => boolean;
  choose: (
    failure: RendererFailure,
    signal: AbortSignal,
  ) => Promise<"reload" | "stay">;
  reload: () => void;
}) {
  let pending: {
    failure: RendererFailure;
    controller: AbortController;
  } | null = null;
  let disposed = false;

  function dismiss() {
    pending?.controller.abort();
    pending = null;
  }

  function failed(failure: RendererFailure) {
    if (disposed || actions.isDestroyed()) return;
    if (pending?.failure === "crashed" || pending?.failure === failure) return;
    dismiss();
    const request = { failure, controller: new AbortController() };
    pending = request;
    void Promise.resolve()
      .then(() => {
        if (pending !== request || request.controller.signal.aborted)
          return "stay";
        return actions.choose(failure, request.controller.signal);
      })
      .then((choice) => {
        if (
          choice === "reload" &&
          pending === request &&
          !disposed &&
          !request.controller.signal.aborted &&
          !actions.isDestroyed()
        )
          actions.reload();
      })
      .catch(() => {
        // Window closure and dialog cancellation can reject. Neither authorizes
        // a reload, much less replaying a provider request.
      })
      .finally(() => {
        if (pending === request) pending = null;
      });
  }

  return {
    failed,
    responsive: () => {
      if (pending?.failure === "unresponsive") dismiss();
    },
    restored: dismiss,
    dispose: () => {
      disposed = true;
      dismiss();
    },
  };
}
