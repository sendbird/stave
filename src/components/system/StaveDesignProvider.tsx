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
  }, []);
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
