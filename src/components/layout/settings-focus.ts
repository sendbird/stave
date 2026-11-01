import { useEffect } from "react";
import {
  clearSettingsFocus,
  useSettingsFocusRequest,
} from "@/lib/providers/accounts-navigation";

/** About one second of frames, for targets that mount after the section. */
const FOCUS_ATTEMPT_FRAMES = 60;

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

/**
 * Lands the pending deep link (`useSettingsFocusRequest`) inside a section.
 * `resolveElementId` names the element a focus request points at: a string is
 * focused once it renders (late targets get a few frames to appear), `null`
 * clears an unknown request and leaves the section at its top, `undefined`
 * leaves the request to another owner inside the section.
 */
export function useSettingsFocusTarget(
  resolveElementId: (focus: string) => string | null | undefined,
) {
  const focus = useSettingsFocusRequest((state) => state.focus);
  const nonce = useSettingsFocusRequest((state) => state.nonce);
  const elementId = focus ? resolveElementId(focus) : undefined;
  useEffect(() => {
    if (!focus || elementId === undefined) return;
    if (elementId === null) {
      clearSettingsFocus(nonce);
      return;
    }
    let attempts = 0;
    let frame = 0;
    const tryFocus = () => {
      const element = document.getElementById(elementId);
      if (element) {
        focusSettingsElement(element);
        clearSettingsFocus(nonce);
        return;
      }
      if (++attempts >= FOCUS_ATTEMPT_FRAMES) {
        clearSettingsFocus(nonce);
        return;
      }
      frame = window.requestAnimationFrame(tryFocus);
    };
    frame = window.requestAnimationFrame(tryFocus);
    return () => window.cancelAnimationFrame(frame);
  }, [elementId, focus, nonce]);
}
