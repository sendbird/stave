import React from "react";
import ReactDOM from "react-dom/client";

import { LandingPage } from "./landing-page";
import { siteData } from "./generated/public-docs.generated";
import "./site.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Landing root container not found.");
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <LandingPage data={siteData} />
  </React.StrictMode>,
);
