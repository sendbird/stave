import { createRoot } from "react-dom/client";
import { installRendererRecovery } from "@/lib/renderer-recovery/renderer-recovery";
import { browserRecoveryEnvironment, RendererRecoveryRoot } from "./RendererRecovery";

/*
 * The renderer entry imports this module first, so its listeners exist before
 * any other renderer module evaluates. If one of them throws, the entry never
 * runs; the start-up listener then mounts the recovery screen on its own root.
 */
installRendererRecovery({
  target: window,
  environment: browserRecoveryEnvironment,
  onStartupFailure: () => {
    const container = document.getElementById("root");
    if (!container) return;
    container.replaceChildren();
    createRoot(container).render(<RendererRecoveryRoot />);
  },
});
