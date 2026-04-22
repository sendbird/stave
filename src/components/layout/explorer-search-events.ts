export const EXPLORER_SEARCH_REQUEST_EVENT = "stave:explorer-search-request";

export function dispatchExplorerSearchRequest() {
  window.dispatchEvent(new CustomEvent(EXPLORER_SEARCH_REQUEST_EVENT));
}
