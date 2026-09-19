import { ipcRenderer } from "electron";
import type { LensReviewApi } from "../src/lib/lens/lens-review.types";

export const lensReviewApi: LensReviewApi = {
  getAutomation: (args) => ipcRenderer.invoke("lens:get-automation", args),
  setAutomationPaused: (args) => ipcRenderer.invoke("lens:set-automation-paused", args),
  compareAnnotation: (args) => ipcRenderer.invoke("lens:compare-annotation", args),
};
