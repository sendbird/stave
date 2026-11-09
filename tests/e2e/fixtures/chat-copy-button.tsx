import { createRoot } from "react-dom/client";
import { applyAppLocale } from "@/i18n";
import { CopyButton } from "@/components/session/chat-panel-message-parts";
import { StaveDesignProvider } from "@/components/system/StaveDesignProvider";
import { Toaster } from "@/components/ui";
import { useAppStore } from "@/store/app.store";
import "@/components/aui/styles.css";
import "@/globals.css";

const params = new URLSearchParams(location.search);
applyAppLocale(params.get("locale") === "ko" ? "ko" : "en");
useAppStore.persist.setOptions({ name: "chat-copy-button-fixture" });

// `?clipboard=refuse` stands for a denied clipboard: the async API rejects and
// the legacy copy command reports failure, so no path can land the copy.
const written: string[] = [];
const refuse = params.get("clipboard") === "refuse";
Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  value: {
    writeText: async (value: string) => {
      if (refuse) throw new DOMException("Write permission denied.", "NotAllowedError");
      written.push(value);
    },
  },
});
if (refuse) {
  document.execCommand = () => false;
}
Object.assign(window, { copyFixture: { written: () => written } });

createRoot(document.getElementById("root")!).render(
  <StaveDesignProvider>
    <main>
      <CopyButton text="The answer to copy." />
    </main>
    <Toaster />
  </StaveDesignProvider>,
);
