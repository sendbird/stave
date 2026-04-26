export const TOP_BAR_PR_ACTION_EVENT = "stave:top-bar-pr-action";

export type TopBarPrAction = "continue" | "create-pr";

export interface TopBarPrActionDetail {
  action: TopBarPrAction;
}

export function dispatchTopBarPrAction(action: TopBarPrAction) {
  window.dispatchEvent(
    new CustomEvent<TopBarPrActionDetail>(TOP_BAR_PR_ACTION_EVENT, {
      detail: { action },
    }),
  );
}
