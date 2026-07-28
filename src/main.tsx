import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

const LEGACY_PAGES_HOST = "manager-note.pages.dev";
const APP_ORIGIN = "https://team-handoff-notes.wegoinnteam.workers.dev";

if (window.location.hostname === LEGACY_PAGES_HOST) {
  window.location.replace(`${APP_ORIGIN}${window.location.pathname}${window.location.search}${window.location.hash}`);
}

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
