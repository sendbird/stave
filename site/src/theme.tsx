import * as React from "react";
import { Moon, Sun, Laptop } from "lucide-react";

import { cx, sx } from "@/components/ads/utils/stylex";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { themeStyles as s } from "./theme.styles";

type ThemeChoice = "light" | "dark" | "system";

const STORAGE_KEY = "stave-site-theme";

function getSystemPrefersDark() {
  if (typeof window === "undefined" || !window.matchMedia) {
    return false;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(choice: ThemeChoice) {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  const shouldBeDark =
    choice === "dark" || (choice === "system" && getSystemPrefersDark());
  root.classList.toggle("dark", shouldBeDark);
  root.dataset.theme = choice;
}

export function ThemeToggle({ className }: { className?: string }) {
  const [choice, setChoice] = React.useState<ThemeChoice>("system");

  React.useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as ThemeChoice | null;
    const initial: ThemeChoice = stored ?? "system";
    setChoice(initial);
    applyTheme(initial);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => {
      const current = (window.localStorage.getItem(STORAGE_KEY) as ThemeChoice | null) ?? "system";
      if (current === "system") {
        applyTheme("system");
      }
    };
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  const update = React.useCallback((next: ThemeChoice) => {
    setChoice(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  }, []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Toggle theme"
          className={className}
          size="icon"
          variant="ghost"
        >
          <Sun className={cx(sx(s.icon), "site-theme-sun")} />
          <Moon className={cx(sx(s.icon), "site-theme-moon")} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={sx(s.menuContent)}>
        <DropdownMenuItem onSelect={() => update("light")}>
          <Sun className={sx(s.icon)} />
          Light
          {choice === "light" ? <span className={sx(s.activeMark)}>•</span> : null}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => update("dark")}>
          <Moon className={sx(s.icon)} />
          Dark
          {choice === "dark" ? <span className={sx(s.activeMark)}>•</span> : null}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => update("system")}>
          <Laptop className={sx(s.icon)} />
          System
          {choice === "system" ? <span className={sx(s.activeMark)}>•</span> : null}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
