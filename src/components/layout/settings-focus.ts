/**
 * Lands a deep link: scrolls the target into view and focuses it, or its first
 * control when the target is a form (`data-focus-first-control`).
 */
export function focusSettingsElement(element: HTMLElement) {
  element.scrollIntoView({ block: "start", behavior: "auto" });
  const control = element.hasAttribute("data-focus-first-control")
    ? element.querySelector<HTMLElement>("input:not([disabled]), textarea:not([disabled]), button:not([disabled])")
    : null;
  (control ?? element).focus({ preventScroll: true });
}
