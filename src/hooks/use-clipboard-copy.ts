import { useCallback, useEffect, useRef, useState } from "react";
import { i18n } from "@/i18n";
import { copyTextToClipboard } from "@/lib/clipboard";
import { toast } from "@/lib/notifications/toast";

/** What the last copy did, for the button's check mark and its announcement. */
export type ClipboardCopyStatus = "idle" | "copied" | "failed";

/**
 * Copy text and never fail silently: when the clipboard refuses (a denied
 * permission, an unfocused window), an error toast says the text was not
 * copied. Resolves to whether the copy landed.
 */
export async function copyTextWithFeedback(text: string): Promise<boolean> {
  try {
    await copyTextToClipboard(text);
    return true;
  } catch {
    toast.error(i18n.t("common:clipboard.copyFailed"));
    return false;
  }
}

/**
 * Copy with a confirmation toast as well, for menu items and other controls
 * that close or have no check mark of their own to show the result.
 */
export async function copyTextWithToasts(text: string, copiedTitle: string): Promise<boolean> {
  const copied = await copyTextWithFeedback(text);
  if (copied) {
    toast.success(copiedTitle);
  }
  return copied;
}

/**
 * A copy button's state: `copied` for a moment after a copy lands, `failed`
 * after the clipboard refused (an error toast has said so). Pair it with
 * `ClipboardCopyAnnouncement` so a screen reader hears either outcome.
 */
export function useClipboardCopy(resetMs = 1500) {
  const [status, setStatus] = useState<ClipboardCopyStatus>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);
  const copy = useCallback(
    async (text: string) => {
      const copied = await copyTextWithFeedback(text);
      if (!mountedRef.current) return copied;
      setStatus(copied ? "copied" : "failed");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (mountedRef.current) setStatus("idle");
      }, resetMs);
      return copied;
    },
    [resetMs],
  );
  return { status, copied: status === "copied", copy };
}
