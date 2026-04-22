import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "@/App";
import "@/globals.css";
import { installDevApiBridge } from "@/lib/dev-bridge";

installDevApiBridge();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
