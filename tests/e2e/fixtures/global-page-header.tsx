import { createRoot } from "react-dom/client";
import { GlobalPageHeader } from "@/components/system/GlobalPageHeader";
import { StaveDesignProvider } from "@/components/system/StaveDesignProvider";
import { Button } from "@/components/ui";
import { X, LayoutGrid } from "lucide-react";
import { applyAppLocale } from "@/i18n";
import { applyThemeClass } from "@/lib/themes/apply";
import { useAppStore } from "@/store/app.store";
import "@/globals.css";
const params = new URLSearchParams(location.search);
const ko = params.get("lang") === "ko";
applyAppLocale(ko ? "ko" : "en");
applyThemeClass({ enabled: params.get("theme") === "dark" });
useAppStore.setState((state) => ({ settings: { ...state.settings, uiDensity: params.get("density") === "compact" ? "compact" : "regular" } }));
createRoot(document.getElementById("root")!).render(<StaveDesignProvider>
  <GlobalPageHeader title={ko ? "전체 에이전트" : "Fleet"} titleIcon={<LayoutGrid />} description={ko ? "진행 중인 작업과 확인이 필요한 항목" : "Work in progress and items needing your attention"}
    actions={<Button aria-label={ko ? "닫기" : "Close"} size="icon-sm"><X /></Button>} />
</StaveDesignProvider>);
