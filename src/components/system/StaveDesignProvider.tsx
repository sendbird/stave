import { LazyMotion, domAnimation } from "motion/react";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { ThemeProvider } from "../ads/components/ThemeProvider";
import { adsThemeVariables } from "./ads-theme";

function subscribeTheme(notify: () => void) {
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

const isDark = () => document.documentElement.classList.contains("dark");

export function StaveDesignProvider({ children }: { children: ReactNode }) {
  const dark = useSyncExternalStore(subscribeTheme, isDark, () => false);
  // Re-applied on every resolved-mode change, and deliberately depending on
  // `dark`. The ADS `ThemeProvider` below writes its theme's variables as
  // INLINE custom properties on `<html>` (so portaled menus/dialogs resolve
  // the same tokens) and, on cleanup, removes every name it wrote. Those are
  // the same hashed names this mapping owns, so a light<->dark toggle used to
  // delete the Stave mapping and leave the raw ADS palette on the document:
  // hovers and scroll chrome went warm grey until the next reload. Child
  // effects run before the parent's, so re-running here after each toggle
  // restores Stave as the last writer.
  useEffect(() => {
    const root = document.documentElement;
    const previous = Object.keys(adsThemeVariables).map(
      (name) => [name, root.style.getPropertyValue(name)] as const,
    );
    for (const [name, value] of Object.entries(adsThemeVariables))
      root.style.setProperty(name, value);
    return () => {
      for (const [name, value] of previous) {
        if (value) root.style.setProperty(name, value);
        else root.style.removeProperty(name);
      }
    };
  }, [dark]);
  return (
    <LazyMotion features={domAnimation}>
      <ThemeProvider
        theme={dark ? "dark" : "light"}
        syncDocument
        style={{ ...adsThemeVariables, display: "contents" }}
      >
        {children}
      </ThemeProvider>
    </LazyMotion>
  );
}
