import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
// tailwind.css pulls in tokens.css + app.css (legacy layer) before the coss layers.
import "./styles/tailwind.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
