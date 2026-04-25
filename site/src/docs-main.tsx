import React from "react";
import ReactDOM from "react-dom/client";

import { DocsPageRoot } from "./docs-page";
import { siteData } from "./generated/public-docs.generated";
import "./site.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Docs root container not found.");
}

const htmlElement = document.documentElement;
const currentRoute = htmlElement.dataset.docRoute ?? "home";

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <DocsPageRoot currentRoute={currentRoute} data={siteData} />
  </React.StrictMode>,
);
